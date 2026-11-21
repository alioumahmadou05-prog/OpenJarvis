import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Globe, Mic, MicOff, Paperclip, Square, Volume2, VolumeX, X } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { nx, type Action, type Message, type Source } from './api';
import { describeAction, runTurn } from './chat';
import { takeSentences, type VoiceState } from './voice';
import { useVoice } from './useVoice';
import { Markdown, Pill } from './ui';

interface Bubble { id: string; role: 'user' | 'assistant'; content: string; source: 'text' | 'voice'; sources?: Source[]; actions?: Action[]; pending?: boolean; error?: boolean }
const toBubble = (m: Message): Bubble => ({ id: m.id, role: m.role, content: m.content, source: m.source, sources: m.meta?.sources, actions: m.meta?.actions });

export function ChatPanel({ conversationId, onConversation, mode, starters = [], onVoiceState, height = 'min(64vh, 680px)', autoSend, web: webDefault = 'auto' }: {
  conversationId: string | null; onConversation: (id: string) => void; mode: string; starters?: string[];
  onVoiceState?: (s: VoiceState) => void; height?: string; autoSend?: string; web?: 'auto' | 'on' | 'off';
}) {
  const model = useAppStore(s => s.selectedModel);
  const voice = useVoice();
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState('');
  const [web, setWeb] = useState<'auto' | 'on' | 'off'>(webDefault);
  const autoSent = useRef(false);
  const [speak, setSpeak] = useState(() => localStorage.getItem('nx.speak') !== '0');
  const [live, setLive] = useState('');
  const [files, setFiles] = useState<{ name: string; text: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const convRef = useRef(conversationId);
  convRef.current = conversationId;
  const busyRef = useRef(false);

  useEffect(() => { localStorage.setItem('nx.speak', speak ? '1' : '0'); if (!speak) voice.engine.stopSpeaking(); }, [speak, voice.engine]);
  useEffect(() => { onVoiceState?.(voice.state); }, [voice.state, onVoiceState]);
  useEffect(() => {
    if (!conversationId) { setBubbles([]); return; }
    if (busyRef.current) return;
    nx.conversation(conversationId).then(c => setBubbles(c.messages.map(toBubble))).catch(e => setError(e.message));
  }, [conversationId]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [bubbles, live]);

  const send = useCallback(async (raw: string, source: 'text' | 'voice' = 'text') => {
    let text = raw.trim();
    if ((!text && !files.length) || busyRef.current) return;
    if (!model) { setError('No model is selected. Start or choose one in the OpenJarvis settings.'); return; }
    if (files.length) text = `${text || 'Look at the attached file(s).'}\n\n${files.map(f => `[File: ${f.name}]\n${f.text}`).join('\n\n')}`;
    setInput(''); setFiles([]); setError(null);
    busyRef.current = true; setBusy(true); voice.engine.stopSpeaking(); voice.engine.setThinking();
    let cid = convRef.current;
    if (!cid) { cid = (await nx.createConversation(mode)).id; convRef.current = cid; onConversation(cid); }
    const uid = 'u' + Date.now(), aid = 'a' + Date.now();
    setBubbles(b => [...b, { id: uid, role: 'user', content: raw.trim() || 'Attached file(s)', source }, { id: aid, role: 'assistant', content: '', source: 'text', pending: true }]);
    ctl.current = new AbortController();
    let spokenLen = 0;
    try {
      const res = await runTurn({
        conversationId: cid, text, mode, model, source, web, signal: ctl.current.signal,
        onStage: s => setStage(s === 'searching' ? (web !== 'off' ? 'Checking live sources…' : '') : s === 'thinking' ? 'Thinking…' : ''),
        onDelta: vis => {
          setBubbles(b => b.map(x => x.id === aid ? { ...x, content: vis } : x));
          if (speak) { const chunk = vis.slice(spokenLen); const [ready, rest] = takeSentences(chunk); ready.forEach(s => voice.engine.say(s)); spokenLen += chunk.length - rest.length; }
        },
      });
      if (speak) { const [ready] = takeSentences(res.text.slice(spokenLen), true); ready.forEach(s => voice.engine.say(s)); }
      setBubbles(b => b.map(x => x.id === aid ? { ...x, content: res.text, pending: false, sources: res.sources, actions: res.actions } : x));
      if (res.usedWeb && !res.webOk) setError('Live search returned nothing, so that answer is from the model\'s own knowledge and may be out of date.');
    } catch (e) {
      setBubbles(b => b.map(x => x.id === aid ? { ...x, content: `I couldn't answer: ${(e as Error).message}`, pending: false, error: true } : x));
    } finally {
      busyRef.current = false; setBusy(false); setStage(''); ctl.current = null;
    }
  }, [files, model, mode, onConversation, speak, voice.engine, web]);

  useEffect(() => { voice.engine.onTurn = t => { void send(t, 'voice'); }; voice.engine.onInterim = setLive; }, [send, voice.engine]);
  useEffect(() => { if (autoSend && !autoSent.current && model) { autoSent.current = true; void send(autoSend); } }, [autoSend, model, send]);

  const addFiles = async (list: FileList) => {
    const out: { name: string; text: string }[] = [];
    for (const f of Array.from(list)) {
      if (f.type.startsWith('text/') || /\.(txt|md|csv|json|tex|py|js|ts|html|xml|srt)$/i.test(f.name)) out.push({ name: f.name, text: (await f.text()).slice(0, 40000) });
      else setError(`"${f.name}": JARVIS can read text files (notes, code, CSV). For PDFs and slides, paste the text or use Research.`);
    }
    if (out.length) setFiles(c => [...c, ...out]);
  };

  return (
    <div className="grid min-h-0" style={{ gridTemplateRows: '1fr auto', height }}>
      <div ref={logRef} className="nx-scroll flex min-h-0 flex-col gap-3 overflow-y-auto pb-3" aria-live="polite">
        {!bubbles.length && (
          <div className="grid gap-3 py-4">
            <p className="nx-dim m-0">Talk or type. I can search the web, set reminders, remember things about you and explain thermodynamics without crying.</p>
            <div className="flex flex-wrap gap-2">{starters.map(s => <button key={s} type="button" className="nx-pill blue cursor-pointer" style={{ background: 'transparent', padding: '6px 12px', fontSize: 13, whiteSpace: 'normal', textAlign: 'left' }} onClick={() => void send(s)}>{s}</button>)}</div>
          </div>
        )}
        {bubbles.map(b => (
          <div key={b.id} className={`max-w-[88%] min-w-0 ${b.role === 'user' ? 'self-end' : 'self-start'}`}>
            {b.role === 'user' ? (
              <div className="whitespace-pre-wrap rounded-2xl rounded-br-sm border px-4 py-2" style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}>{b.source === 'voice' && <Mic size={12} className="mr-1 inline opacity-60" />}{b.content}</div>
            ) : (
              <div>
                <div className="nx-eyebrow mb-1" style={{ fontSize: 10 }}>JARVIS</div>
                {b.pending && !b.content ? <span className="nx-dim text-sm">{stage || 'Thinking…'}</span> : <div style={b.error ? { color: 'var(--bad)' } : undefined}><Markdown text={b.content} /></div>}
                {!!b.actions?.length && <div className="mt-2 grid gap-1">{b.actions.map((a, i) => <span key={i} className="nx-mono text-xs" style={{ color: a.ok ? 'var(--cyan)' : 'var(--warn)' }}>◆ {describeAction(a)}</span>)}</div>}
                {!!b.sources?.length && !b.pending && (
                  <div className="mt-2 flex flex-wrap gap-1.5">{b.sources.map((s, i) => <a key={i} href={s.url} target="_blank" rel="noreferrer" className="nx-pill no-underline" title={s.snippet}>[{i + 1}] {s.title.slice(0, 48)}{s.date ? ` · ${s.date}` : ''}</a>)}</div>
                )}
              </div>
            )}
          </div>
        ))}
        {live && <div className="self-end text-sm italic" style={{ color: 'var(--hot)' }}>“{live}”</div>}
        {error && <div className="text-sm" style={{ color: 'var(--warn)' }}>{error}</div>}
      </div>
      <div className="grid gap-2">
        {!!files.length && <div className="flex flex-wrap gap-2">{files.map((f, i) => <Pill key={i}>📄 {f.name} <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(c => c.filter((_, j) => j !== i))}><X size={12} /></button></Pill>)}</div>}
        <form className="flex items-end gap-1.5 rounded-[20px] border p-1.5" style={{ background: 'var(--panel)', borderColor: 'var(--line)' }}
          onSubmit={e => { e.preventDefault(); if (busy) ctl.current?.abort(); else void send(input); }}>
          <button type="button" className="grid h-9 w-9 flex-none place-items-center rounded-full" title={voice.active ? 'End voice conversation' : 'Start voice conversation'} aria-label="Voice conversation" aria-pressed={voice.active}
            style={{ color: voice.active ? '#fff' : 'var(--dim)', background: voice.active ? 'var(--blue)' : 'transparent' }} onClick={() => voice.active ? voice.engine.stop() : void voice.engine.start()}>
            {voice.active ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button type="button" className="grid h-9 w-9 flex-none place-items-center rounded-full" title="Attach text files" aria-label="Attach" style={{ color: 'var(--dim)' }} onClick={() => fileRef.current?.click()}><Paperclip size={18} /></button>
          <input ref={fileRef} type="file" multiple hidden onChange={e => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
          <textarea rows={1} value={input} onChange={e => setInput(e.target.value)} placeholder={voice.active ? 'Listening… you can also type' : 'Message JARVIS…'} aria-label="Message JARVIS"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); } }}
            className="max-h-36 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 outline-none" />
          <button type="button" className="grid h-9 w-9 flex-none place-items-center rounded-full" aria-label={`Web search: ${web}`} title={`Web search: ${web === 'auto' ? 'automatic' : web}`}
            style={{ color: web === 'off' ? 'var(--dim)' : web === 'on' ? 'var(--cyan)' : 'var(--hot)', opacity: web === 'off' ? .5 : 1 }} onClick={() => setWeb(w => w === 'auto' ? 'on' : w === 'on' ? 'off' : 'auto')}><Globe size={18} /></button>
          <button type="button" className="grid h-9 w-9 flex-none place-items-center rounded-full" aria-label={speak ? 'Mute replies' : 'Speak replies'} title={speak ? 'JARVIS speaks replies' : 'JARVIS is muted'} style={{ color: speak ? 'var(--cyan)' : 'var(--dim)' }} onClick={() => setSpeak(s => !s)}>{speak ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
          <button type="submit" aria-label={busy ? 'Stop' : 'Send'} className="grid h-9 w-9 flex-none place-items-center rounded-full" style={{ background: 'var(--blue)', color: '#fff' }}>{busy ? <Square size={14} fill="currentColor" /> : <ArrowUp size={18} />}</button>
        </form>
        {voice.error && <p className="m-0 text-xs" style={{ color: 'var(--warn)' }}>{voice.error}</p>}
      </div>
    </div>
  );
}
