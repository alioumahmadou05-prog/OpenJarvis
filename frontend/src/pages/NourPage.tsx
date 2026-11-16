import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mic, Paperclip, Square, ArrowUp, Volume2, X, Loader2 } from 'lucide-react';
import { Orb, type OrbMood } from '../components/Nour/Orb';
import { streamChat } from '../lib/sse';
import { useAppStore } from '../lib/store';
import { useTtsStore } from '../lib/tts';
import { useSpeech } from '../hooks/useSpeech';
import {
  MODES, NOUR_LANGUAGES, applyMemory, buildMessages, memoryOps, stripWakeWord, visibleText,
  type AttachedText, type NourFact, type NourMode, type NourTurn,
} from '../lib/nour';

interface Bubble { id: string; role: 'you' | 'ai' | 'err'; text: string; files?: string[]; notes?: string[] }

const TEXT_EXT = /\.(txt|md|csv|json|srt|vtt|html?|xml|py|js|ts|java|c|cpp)$/i;
const uid = () => Math.random().toString(36).slice(2, 10);

function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function store(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

const C = {
  void: '#05030a', panel: '#0e0a18', line: '#2a2140', ink: '#ece6ff', dim: '#8f84ad',
  plasma: '#b67cff', hot: '#e9d4ff',
};

export function NourPage() {
  const models = useAppStore((s) => s.models);
  const selectedModel = useAppStore((s) => s.selectedModel);
  const tts = useTtsStore();
  const speech = useSpeech();

  const [mode, setMode] = useState<NourMode>(() => load('nour-mode', 'chat'));
  const [lang, setLang] = useState<string>(() => load('nour-lang', 'English'));
  const [smart, setSmart] = useState<boolean>(() => load('nour-smart', false));
  const [brains, setBrains] = useState<{ fast: string; smart: string }>(() => load('nour-brains', { fast: '', smart: '' }));
  const [voiceOn, setVoiceOn] = useState<boolean>(() => load('nour-voice', false));
  const [facts, setFacts] = useState<NourFact[]>(() => load('nour-memory', []));
  const [history, setHistory] = useState<NourTurn[]>(() => load('nour-history', []));
  const [bubbles, setBubbles] = useState<Bubble[]>(() =>
    load<NourTurn[]>('nour-history', []).map((m) => ({ id: uid(), role: m.role === 'user' ? 'you' : 'ai', text: m.content })),
  );
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<AttachedText[]>([]);
  const [busy, setBusy] = useState(false);
  const [memOpen, setMemOpen] = useState(false);
  const [newFact, setNewFact] = useState('');
  const [confirmForget, setConfirmForget] = useState(false);
  const [notice, setNotice] = useState('');

  const ctlRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { store('nour-mode', mode); }, [mode]);
  useEffect(() => { store('nour-lang', lang); }, [lang]);
  useEffect(() => { store('nour-smart', smart); }, [smart]);
  useEffect(() => { store('nour-brains', brains); }, [brains]);
  useEffect(() => { store('nour-voice', voiceOn); }, [voiceOn]);
  useEffect(() => { store('nour-memory', facts); }, [facts]);
  useEffect(() => { store('nour-history', history.slice(-30)); }, [history]);
  useEffect(() => { void tts.ensureHealth(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [bubbles]);

  const chatModels = useMemo(() => models.map((m) => m.id), [models]);
  const activeModel = (smart ? brains.smart : brains.fast) || selectedModel || chatModels[0] || '';

  const mood: OrbMood = busy
    ? 'thinking'
    : tts.state === 'speaking' ? 'speaking'
    : tts.state === 'loading' ? 'thinking'
    : speech.state !== 'idle' ? 'listening'
    : 'idle';
  const statusText = busy ? (smart ? 'Thinking deeply' : 'Thinking')
    : tts.state !== 'idle' ? 'Speaking'
    : speech.state === 'recording' ? 'Listening'
    : speech.state === 'transcribing' ? 'Transcribing'
    : activeModel ? `Online · ${activeModel}` : 'No model selected';

  const ask = useCallback(async (raw: string) => {
    if (busy) return;
    const attached = files;
    let text = raw.trim();
    if (!text && !attached.length) return;
    if (!text) text = MODES[mode].defaultAsk;
    if (!activeModel) {
      setNotice('Pick a model first: start one in Settings, then choose it at the bottom of this page.');
      return;
    }
    setNotice('');
    setInput('');
    setFiles([]);
    const stored = text + (attached.length ? `\n(attached: ${attached.map((f) => f.name).join(', ')})` : '');
    const youId = uid(), aiId = uid();
    setBubbles((b) => [...b, { id: youId, role: 'you', text, files: attached.map((f) => f.name) }, { id: aiId, role: 'ai', text: '…' }]);
    const messages = buildMessages(history, text, { mode, lang, facts, files: attached });
    setHistory((h) => [...h, { role: 'user', content: stored }]);
    setBusy(true);
    tts.stop();
    const ctl = new AbortController();
    ctlRef.current = ctl;
    let acc = '';
    const update = (patch: Partial<Bubble>) => setBubbles((b) => b.map((x) => (x.id === aiId ? { ...x, ...patch } : x)));
    try {
      for await (const ev of streamChat({ model: activeModel, messages, stream: true }, ctl.signal)) {
        if (ev.event) continue;
        try {
          const data = JSON.parse(ev.data);
          const delta = data.choices?.[0]?.delta?.content;
          if (delta) {
            acc += delta;
            update({ text: visibleText(acc) || '…' });
          }
          if (data.choices?.[0]?.finish_reason === 'stop') break;
        } catch { /* keep-alive or non-JSON line */ }
      }
      const clean = visibleText(acc);
      const { facts: nextFacts, notes } = applyMemory(facts, memoryOps(acc));
      if (notes.length) setFacts(nextFacts);
      update({ text: clean || '(no answer)', notes });
      setHistory((h) => [...h, { role: 'assistant', content: clean }]);
      if (voiceOn && tts.available && clean) void tts.speak(aiId, clean);
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      if (acc) update({ text: visibleText(acc) });
      else update({ role: aborted ? 'ai' : 'err', text: aborted ? '(stopped)' : `I couldn't reach the model (${(err as Error).message}). Is the OpenJarvis server running?` });
      setHistory((h) => h.slice(0, -1));
    } finally {
      setBusy(false);
      ctlRef.current = null;
    }
  }, [busy, files, mode, lang, facts, history, activeModel, voiceOn, tts]);

  const toggleMic = async () => {
    if (speech.state === 'recording') {
      try {
        const heard = stripWakeWord(await speech.stopRecording());
        if (heard) void ask(heard);
      } catch { /* nothing recorded */ }
    } else if (speech.state === 'idle') {
      await speech.startRecording();
    }
  };

  const addFiles = async (list: FileList | File[]) => {
    const next: AttachedText[] = [];
    for (const f of Array.from(list)) {
      if (f.type.startsWith('text/') || TEXT_EXT.test(f.name) || f.type === 'application/json') {
        next.push({ name: f.name, text: (await f.text()).slice(0, 20000) });
      } else {
        setNotice(`"${f.name}" isn't a text file. Local models here read text files; for photos, use the Nour web app.`);
      }
    }
    if (next.length) setFiles((cur) => [...cur, ...next]);
  };

  const M = MODES[mode];
  const pill = (active: boolean): React.CSSProperties => ({
    color: active ? C.hot : C.dim,
    border: `1px solid ${active ? C.plasma : 'transparent'}`,
    background: active ? 'rgba(182,124,255,0.12)' : 'transparent',
  });

  return (
    <div className="h-full w-full overflow-hidden" style={{ background: C.void, color: C.ink, fontFamily: 'Geist Variable, system-ui, sans-serif' }}>
      <div className="mx-auto grid h-full max-w-3xl px-4 py-3" style={{ gridTemplateRows: 'auto auto auto 1fr auto' }}>
        <div className="mx-auto aspect-square" style={{ width: 'min(280px, 60vw, 32vh)' }}>
          <Orb mood={mood} />
        </div>
        <div className="-mt-1 text-center">
          <h1 className="m-0 text-4xl font-light" style={{ letterSpacing: '0.32em', paddingLeft: '0.32em', color: C.hot, textShadow: '0 0 18px rgba(182,124,255,0.55)' }}>Nx Ai</h1>
          <div role="status" className="mt-1 font-mono text-[11px] uppercase" style={{ letterSpacing: '0.18em', color: speechOrBusy(busy, tts.state, speech.state) ? C.plasma : C.dim }}>{statusText}</div>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5" role="group" aria-label="Mode">
          {(Object.keys(MODES) as NourMode[]).map((k) => (
            <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)} className="cursor-pointer rounded-full px-3 py-1 text-[13px]" style={pill(mode === k)}>
              {MODES[k].label}
            </button>
          ))}
          {M.needsLanguage && (
            <select aria-label="Language" value={lang} onChange={(e) => setLang(e.target.value)} className="rounded-full px-2.5 py-1 text-[13px]" style={{ background: C.panel, border: `1px solid ${C.line}`, color: C.ink }}>
              {NOUR_LANGUAGES.map((l) => <option key={l}>{l}</option>)}
            </select>
          )}
        </div>

        <div ref={logRef} aria-live="polite" className="flex min-h-0 flex-col gap-3.5 overflow-y-auto py-4"
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void addFiles(e.dataTransfer.files); }}>
          {bubbles.length === 0 && (
            <div className="leading-relaxed"><Tag />Nour, at your service. Pick a mode above, type below, or tap the mic and say “Nour”. I'll pretend it's a challenge.</div>
          )}
          {bubbles.map((b) => (
            <div key={b.id} className={`min-w-0 max-w-[88%] whitespace-pre-wrap break-words leading-relaxed ${b.role === 'you' ? 'self-end' : 'self-start'}`}
              style={b.role === 'you' ? { background: C.panel, border: `1px solid ${C.line}`, padding: '8px 14px', borderRadius: '16px 16px 4px 16px' } : { color: b.role === 'err' ? '#ffb3c8' : C.ink }}>
              {b.role !== 'you' && <Tag />}
              {b.text}
              {b.files?.map((f) => <span key={f} className="block font-mono text-[11px]" style={{ color: C.dim }}>📄 {f}</span>)}
              {b.notes?.map((n) => <span key={n} className="mt-1.5 block font-mono text-[11px]" style={{ color: C.plasma }}>◆ {n}</span>)}
            </div>
          ))}
          {notice && <div className="text-sm" style={{ color: '#ffb3c8' }}>{notice}</div>}
        </div>

        <div>
          <div className="flex gap-2 overflow-x-auto pb-2.5">
            {M.examples(lang).map((ex) => (
              <button key={ex} type="button" onClick={() => void ask(ex)} className="flex-none cursor-pointer rounded-full px-3 py-1.5 text-[13px]" style={{ color: C.dim, border: `1px solid ${C.line}` }}>{ex}</button>
            ))}
          </div>
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 pb-2">
              {files.map((f, i) => (
                <span key={f.name + i} className="flex items-center gap-1.5 rounded-xl px-2 py-1 text-xs" style={{ background: C.panel, border: `1px solid ${C.line}`, color: C.dim }}>
                  📄 {f.name}
                  <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))} className="cursor-pointer"><X size={14} /></button>
                </span>
              ))}
            </div>
          )}
          <form className="flex items-end gap-1.5 rounded-[22px] p-1.5" style={{ background: C.panel, border: `1px solid ${C.line}` }}
            onSubmit={(e) => { e.preventDefault(); if (busy) ctlRef.current?.abort(); else void ask(input); }}>
            {speech.available && (
              <IconBtn label={speech.state === 'recording' ? 'Stop and send' : 'Talk to Nour'} pressed={speech.state === 'recording'} onClick={() => void toggleMic()}>
                {speech.state === 'transcribing' ? <Loader2 size={18} className="animate-spin" /> : <Mic size={18} />}
              </IconBtn>
            )}
            <IconBtn label="Attach a text file" onClick={() => fileRef.current?.click()}><Paperclip size={18} /></IconBtn>
            <input ref={fileRef} type="file" multiple hidden accept=".txt,.md,.csv,.json,.srt,text/plain" onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ''; }} />
            <textarea rows={1} value={input} placeholder={M.hint(lang)} aria-label="Message Nour"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(input); } }}
              className="max-h-36 min-w-0 flex-1 resize-none bg-transparent px-2.5 py-2 outline-none" style={{ color: C.ink }} />
            {tts.available && (
              <IconBtn label="Read replies aloud" pressed={voiceOn} onClick={() => { setVoiceOn((v) => !v); tts.stop(); }}><Volume2 size={18} /></IconBtn>
            )}
            <button type="submit" aria-label={busy ? 'Stop' : 'Send'} className="grid h-[38px] w-[38px] flex-none cursor-pointer place-items-center rounded-full" style={{ background: C.plasma, color: C.void }}>
              {busy ? <Square size={14} fill="currentColor" /> : <ArrowUp size={18} />}
            </button>
          </form>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-full p-0.5" style={{ border: `1px solid ${C.line}` }} role="group" aria-label="Brain">
                {(['fast', 'smart'] as const).map((k) => (
                  <button key={k} type="button" aria-pressed={smart === (k === 'smart')} onClick={() => setSmart(k === 'smart')} className="cursor-pointer rounded-full px-2.5 py-1 capitalize"
                    style={{ color: smart === (k === 'smart') ? C.hot : C.dim, background: smart === (k === 'smart') ? 'rgba(182,124,255,0.18)' : 'transparent' }}>{k}</button>
                ))}
              </div>
              <select aria-label={`Model for ${smart ? 'Smart' : 'Fast'}`} value={activeModel}
                onChange={(e) => setBrains((b) => ({ ...b, [smart ? 'smart' : 'fast']: e.target.value }))}
                className="max-w-[180px] rounded-full px-2 py-1" style={{ background: C.panel, border: `1px solid ${C.line}`, color: C.dim }}>
                {!chatModels.includes(activeModel) && activeModel && <option>{activeModel}</option>}
                {chatModels.map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <button type="button" onClick={() => { setMemOpen(true); setConfirmForget(false); }} className="cursor-pointer" style={{ color: C.dim }}>Memory · {facts.length}</button>
          </div>
        </div>
      </div>

      {memOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center px-4" style={{ background: 'rgba(5,3,10,0.72)', backdropFilter: 'blur(6px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setMemOpen(false); }}
          onKeyDown={(e) => { if (e.key === 'Escape') setMemOpen(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="nour-mem-title" className="grid max-h-[80vh] w-full max-w-md gap-3 overflow-auto rounded-2xl p-5" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
            <div className="flex items-center justify-between">
              <h2 id="nour-mem-title" className="m-0 text-lg font-medium">What Nour remembers</h2>
              <button type="button" onClick={() => setMemOpen(false)} className="cursor-pointer rounded-lg px-3 py-1.5 text-sm" style={{ border: `1px solid ${C.line}` }}>Close</button>
            </div>
            <p className="m-0 text-[13px] leading-normal" style={{ color: C.dim }}>Lasting facts you share, like your name, the languages you're learning or your exams. Stored only on this computer.</p>
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {facts.length === 0 && <li className="text-sm" style={{ color: C.dim }}>Nothing yet. Tell Nour about yourself, or add a note below.</li>}
              {facts.map((f, i) => (
                <li key={f.t} className="flex items-start justify-between gap-2 py-1.5 text-sm" style={{ borderBottom: `1px solid ${C.line}` }}>
                  <span className="min-w-0 break-words">{f.t}</span>
                  <button type="button" aria-label={`Forget: ${f.t}`} onClick={() => setFacts((cur) => cur.filter((_, j) => j !== i))} className="cursor-pointer" style={{ color: C.dim }}><X size={16} /></button>
                </li>
              ))}
            </ul>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setFacts((cur) => applyMemory(cur, { remember: [newFact], forget: [] }).facts); setNewFact(''); }}>
              <input value={newFact} onChange={(e) => setNewFact(e.target.value)} placeholder="Add something, e.g. I'm learning Spanish (A2)" aria-label="New memory"
                className="min-w-0 flex-1 rounded-lg px-2.5 py-2 text-sm outline-none" style={{ background: C.void, border: `1px solid ${C.line}`, color: C.ink }} />
              <button type="submit" className="cursor-pointer rounded-lg px-3 text-sm" style={{ background: C.plasma, color: C.void }}>Add</button>
            </form>
            <div className="flex justify-end">
              <button type="button" className="cursor-pointer rounded-lg px-3 py-1.5 text-sm" style={{ border: `1px solid ${C.line}`, color: '#ffb3c8' }}
                onClick={() => { if (!confirmForget) { setConfirmForget(true); return; } setFacts([]); setConfirmForget(false); }}>
                {confirmForget ? 'Click again to erase all' : 'Forget everything'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function speechOrBusy(busy: boolean, ttsState: string, speechState: string) {
  return busy || ttsState !== 'idle' || speechState !== 'idle';
}

function Tag() {
  return <span className="mr-2.5 font-mono text-[10px]" style={{ letterSpacing: '0.15em', color: C.plasma }}>NOUR</span>;
}

function IconBtn({ label, pressed, onClick, children }: { label: string; pressed?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={pressed} onClick={onClick}
      className="grid h-[38px] w-[38px] flex-none cursor-pointer place-items-center rounded-full"
      style={{ color: pressed ? C.hot : C.dim, background: pressed ? 'rgba(182,124,255,0.16)' : 'transparent' }}>
      {children}
    </button>
  );
}
