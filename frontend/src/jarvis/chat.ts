import { streamChat } from '../lib/sse';
import { nx, visible, type Action, type Source } from './api';

/**
 * One conversation turn: save the user's message, build JARVIS's context (persona, memory,
 * live web results), stream the model's reply, then save it. The server applies any actions
 * (reminders, memories) found in the reply and returns them.
 */
export interface TurnResult { text: string; sources: Source[]; actions: Action[]; usedWeb: boolean; webOk: boolean }

export async function runTurn(opts: {
  conversationId: string;
  text: string;
  mode: string;
  model: string;
  source?: 'text' | 'voice';
  web?: 'auto' | 'on' | 'off';
  onStage?: (s: 'searching' | 'thinking' | 'writing') => void;
  onDelta?: (visibleText: string, raw: string) => void;
  signal?: AbortSignal;
}): Promise<TurnResult> {
  const { conversationId, text, mode, model } = opts;
  const ctxP = nx.context({ message: text, mode, conversation_id: conversationId, web: opts.web || 'auto' });
  await nx.addMessage(conversationId, { role: 'user', content: text, source: opts.source || 'text' });
  opts.onStage?.('searching');
  const ctx = await ctxP;
  opts.onStage?.('thinking');
  const messages = [
    { role: 'system', content: ctx.system },
    ...ctx.history.slice(-14).map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: text },
  ];
  let raw = '';
  try {
    for await (const ev of streamChat({ model, messages, stream: true }, opts.signal)) {
      if (ev.event) continue;
      try {
        const data = JSON.parse(ev.data);
        const delta = data.choices?.[0]?.delta?.content;
        if (delta) {
          if (!raw) opts.onStage?.('writing');
          raw += delta;
          opts.onDelta?.(visible(raw), raw);
        }
        if (data.choices?.[0]?.finish_reason === 'stop') break;
      } catch { /* keep-alive */ }
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') throw err;
  }
  if (!raw.trim()) raw = opts.signal?.aborted ? '(stopped)' : '(no answer from the model)';
  const saved = await nx.addMessage(conversationId, { role: 'assistant', content: raw, sources: ctx.sources });
  return { text: saved.message.content, sources: ctx.sources, actions: saved.actions, usedWeb: ctx.used_web, webOk: ctx.web_ok };
}

export function describeAction(a: Action): string {
  if (!a.ok) return `Couldn't ${a.type === 'remind' ? 'set the reminder' : 'do that'}: ${a.error}`;
  if (a.type === 'remind') return `Reminder set: ${a.text} · ${new Date((a.due_at || 0) * 1000).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${a.recurrence && a.recurrence !== 'none' ? ` · ${a.recurrence}` : ''}`;
  if (a.type === 'remember') return a.duplicate ? `Already remembered: ${a.text}` : `Remembered: ${a.text}`;
  return `Forgot ${a.removed || 0} memory item(s) about "${a.keyword}"`;
}
