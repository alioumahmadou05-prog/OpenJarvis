import { useCallback, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  Bell, BookOpen, BrainCircuit, CalendarClock, ChevronUp, Globe2, History, Inbox, Keyboard, LayoutGrid, Newspaper, Orbit, Plug, Settings as Cog, X,
} from 'lucide-react';
import { Orb, type OrbMood } from '../components/Nour/Orb';
import { getBase, authHeaders } from '../lib/api';
import { nx, type Notice, type Status } from './api';
import { ChatPanel } from './ChatPanel';
import type { VoiceState } from './voice';
import { useVoice } from './useVoice';
import { NX_CSS } from './ui';
import { BriefingPage, InboxPage, RemindersPage } from './PersonalPages';
import { AcademicPage, HistoryPage, MemoryPage, ResearchPage } from './KnowledgePages';
import { AppsPage, SettingsPage, SitesPage } from './SystemPages';

const NAV = [
  { to: '/jarvis', icon: Orbit, label: 'Talk to Nour', end: true },
  { to: '/jarvis/history', icon: History, label: 'Chats' },
  { to: '/jarvis/briefing', icon: Newspaper, label: 'Daily briefing' },
  { to: '/jarvis/inbox', icon: Inbox, label: 'Email & calendar' },
  { to: '/jarvis/reminders', icon: CalendarClock, label: 'Reminders' },
  { to: '/jarvis/academic', icon: BookOpen, label: 'Academic' },
  { to: '/jarvis/research', icon: Globe2, label: 'Web research' },
  { to: '/jarvis/sites', icon: LayoutGrid, label: 'My websites' },
  { to: '/jarvis/memory', icon: BrainCircuit, label: 'Memory' },
  { to: '/jarvis/apps', icon: Plug, label: 'Connected apps' },
  { to: '/jarvis/settings', icon: Cog, label: 'Settings' },
];


/**
 * Nour AI is voice-first: launching shows only the Nour logo. Everything else (chats, settings,
 * reminders…) lives behind the small "^" menu at the bottom left.
 */
export function JarvisApp() {
  const [status, setStatus] = useState<Status | null>(null);
  const [toasts, setToasts] = useState<Notice[]>([]);
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  const onHome = location.pathname.replace(/\/$/, '') === '/jarvis';

  const refreshStatus = useCallback(() => { nx.status().then(setStatus).catch(() => setStatus(null)); }, []);
  useEffect(() => { refreshStatus(); const t = setInterval(refreshStatus, 30000); return () => clearInterval(t); }, [refreshStatus]);
  useEffect(() => { setMenu(false); }, [location.pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Live notifications: server-sent events, falling back to polling when the server needs an API key.
  useEffect(() => {
    let es: EventSource | null = null, poll: number | undefined, since = Date.now() / 1000;
    const show = (n: Notice) => {
      setToasts(t => [n, ...t].slice(0, 4));
      if ('Notification' in window && Notification.permission === 'granted') new Notification(n.title, { body: n.body });
      setTimeout(() => setToasts(t => t.filter(x => x.id !== n.id)), 12000);
      refreshStatus();
    };
    const usePolling = () => { poll = window.setInterval(async () => { try { const { notifications } = await nx.notifications(true); notifications.filter(n => n.created_at > since).reverse().forEach(n => { since = Math.max(since, n.created_at); show(n); }); } catch { /* offline */ } }, 15000); };
    if (Object.keys(authHeaders()).some(k => k.toLowerCase() === 'authorization')) usePolling();
    else { es = new EventSource(`${getBase()}/v1/nxxr/events`); es.onmessage = e => { try { show(JSON.parse(e.data)); } catch { /* ignore */ } }; es.onerror = () => { es?.close(); es = null; if (!poll) usePolling(); }; }
    return () => { es?.close(); clearInterval(poll); };
  }, [refreshStatus]);

  return (
    <div className="nx relative h-full min-h-0 w-full">
      <style>{NX_CSS}</style>
      <main className={`nx-scroll h-full min-w-0 ${onHome ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        {!status && !onHome && <div className="nx-card mx-auto mt-4 w-[min(1100px,calc(100%-32px))] text-sm" style={{ borderColor: 'rgba(255,125,154,.4)' }}>Nour's server isn't answering. Start OpenJarvis (<code>jarvis serve</code>) or open the desktop app, then reload.</div>}
        <Routes>
          <Route index element={<VoiceHome status={status} />} />
          {[
            ['history', <HistoryPage />], ['briefing', <BriefingPage />], ['inbox', <InboxPage />], ['reminders', <RemindersPage />],
            ['academic', <AcademicPage />], ['research', <ResearchPage />], ['sites', <SitesPage />], ['memory', <MemoryPage />],
            ['apps', <AppsPage />], ['settings', <SettingsPage />],
          ].map(([path, el]) => <Route key={path as string} path={path as string} element={<div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 md:px-6">{el}</div>} />)}
          <Route path="voice" element={<VoiceHome status={status} />} />
        </Routes>
      </main>

      {/* The "^" menu */}
      {menu && <div className="fixed inset-0 z-40" style={{ background: 'rgba(3,5,11,.55)' }} onClick={() => setMenu(false)} />}
      <div className="fixed z-50" style={{ left: 'max(16px, env(safe-area-inset-left))', bottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        {menu && (
          <nav aria-label="Nour menu" className="nx-card nx-scroll mb-2 w-64 overflow-y-auto p-2" style={{ maxHeight: 'min(78vh, 640px)', boxShadow: '0 20px 60px rgba(0,0,0,.6)' }}>
            <div className="px-2 pb-2 pt-1"><b><span style={{ color: 'var(--cyan)' }}>Nour</span> AI</b></div>
            <div className="grid gap-0.5">
              {NAV.map(n => (
                <NavLink key={n.to} to={n.to} end={n.end}
                  className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm no-underline ${isActive ? 'font-medium' : ''}`}
                  style={({ isActive }) => ({ color: isActive ? 'var(--hot)' : 'var(--ink)', background: isActive ? 'rgba(47,140,255,.16)' : 'transparent' })}>
                  <n.icon size={16} style={{ color: 'var(--cyan)' }} /> {n.label}
                  {n.label === 'Reminders' && !!status?.counts.reminders_pending && <span className="nx-mono nx-dim ml-auto text-[11px]">{status.counts.reminders_pending}</span>}
                </NavLink>
              ))}
            </div>
            <div className="mt-2 grid gap-1 border-t px-2 pt-2 text-xs" style={{ borderColor: 'var(--line)' }}>
              <Dot ok={status?.internet ?? null} on="Internet connected" off="No internet" />
              <Dot ok={status ? true : false} on={`Brain: ${status?.model || 'default'}`} off="Server offline" />
              <Dot ok={status?.scheduler ?? null} on="Reminders & monitoring on" off="Scheduler off" />
            </div>
          </nav>
        )}
        <button type="button" onClick={() => setMenu(m => !m)} aria-expanded={menu} aria-label={menu ? 'Close menu' : 'Open menu'} title="Menu"
          className="relative grid h-10 w-10 place-items-center rounded-full border"
          style={{ background: menu ? 'var(--blue)' : 'rgba(14,26,51,.85)', borderColor: menu ? 'var(--blue)' : 'var(--line)', color: menu ? '#fff' : 'var(--dim)', backdropFilter: 'blur(8px)' }}>
          <ChevronUp size={20} style={{ transform: menu ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
          {!menu && !!status?.counts.notifications_unread && <span className="absolute right-1 top-1 h-2 w-2 rounded-full" style={{ background: 'var(--cyan)' }} />}
        </button>
      </div>

      <div className="fixed bottom-4 right-4 z-50 grid w-[min(360px,calc(100%-32px))] gap-2">
        {toasts.map(t => (
          <div key={t.id} role="status" className="nx-card flex gap-3" style={{ borderColor: 'var(--blue)', boxShadow: '0 10px 40px rgba(0,0,0,.5)' }}>
            <Bell size={18} style={{ color: 'var(--cyan)', flex: 'none', marginTop: 2 }} />
            <div className="min-w-0 flex-1"><b className="text-sm">{t.title}</b>{t.body && <p className="nx-dim m-0 text-sm">{t.body}</p>}</div>
            <button type="button" aria-label="Dismiss" onClick={() => { setToasts(x => x.filter(y => y.id !== t.id)); void nx.readNotice(t.id); }}><X size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Dot({ ok, on, off }: { ok: boolean | null; on: string; off: string }) {
  return <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: ok ? 'var(--good)' : ok === false ? 'var(--bad)' : 'var(--dim)' }} /> {ok ? on : ok === false ? off : 'Checking…'}</span>;
}

function moodOf(s: VoiceState, busy = false): OrbMood {
  return s === 'speaking' ? 'speaking' : s === 'thinking' || busy ? 'thinking' : s === 'hearing' || s === 'listening' ? 'listening' : 'idle';
}

const STATE_TEXT: Record<VoiceState, string> = { off: 'Tap Nour to talk', listening: 'Listening…', hearing: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking… (talk to interrupt)' };

/** The launch screen: the Nour logo, its state, a caption, and nothing else in the way. */
function VoiceHome({ status }: { status: Status | null }) {
  const [params, setParams] = useSearchParams();
  const cid = params.get('c');
  const setCid = (id: string | null) => setParams(p => { const n = new URLSearchParams(p); if (id) n.set('c', id); else n.delete('c'); return n; }, { replace: true });
  const ask = params.get('ask') || undefined;
  const [mode] = useState(() => params.get('mode') || localStorage.getItem('nx.mode') || 'companion');
  const [vstate, setVstate] = useState<VoiceState>('off');
  const [typing, setTyping] = useState(() => !!ask || !!cid);
  const [caption, setCaption] = useState<{ who: 'you' | 'nour'; text: string } | null>(null);
  const voice = useVoice();
  const navigate = useNavigate();
  const onCaption = useCallback((who: 'you' | 'nour', text: string) => {
    setCaption({ who, text });
  }, []);
  const toggleVoice = () => (voice.active ? voice.engine.stop() : void voice.engine.start());
  const shown = caption?.text ? (caption.text.length > 240 ? '…' + caption.text.slice(-240) : caption.text) : '';

  return (
    <div className="relative flex h-full flex-col items-center justify-center px-4" style={{ paddingBottom: typing ? 0 : 40 }}>
      <div className={`flex flex-col items-center transition-all ${typing ? 'pt-4' : ''}`} style={{ gap: typing ? 4 : 10 }}>
        <button type="button" onClick={toggleVoice} aria-label={voice.active ? 'Stop talking to Nour' : 'Talk to Nour'} aria-pressed={voice.active}
          className="rounded-full" style={{ width: typing ? 'min(150px, 34vw)' : 'min(420px, 78vw, 58vh)', aspectRatio: '1', transition: 'width .35s', cursor: 'pointer' }}>
          <Orb mood={moodOf(vstate)} palette="blue" />
        </button>
        <h1 className="m-0 font-light" style={{ fontSize: typing ? 22 : 'clamp(30px, 5vw, 44px)', letterSpacing: '.3em', paddingLeft: '.3em', color: 'var(--hot)', textShadow: '0 0 18px rgba(47,140,255,.55)' }}>NOUR AI</h1>
        <div className="nx-eyebrow" style={{ color: vstate === 'off' ? 'var(--dim)' : 'var(--cyan)' }}>{status ? STATE_TEXT[vstate] : 'Server offline'}</div>
        {!typing && (
          <p className="m-0 mt-2 max-w-xl text-center text-[15px]" aria-live="polite" style={{ color: caption?.who === 'you' ? 'var(--dim)' : 'var(--ink)', minHeight: '3em' }}>
            {shown ? (caption!.who === 'you' ? `“${shown}”` : shown) : voice.error || ''}
          </p>
        )}
      </div>

      {/* Chat stays mounted so voice turns are handled even when the keyboard view is closed. */}
      <div className={typing ? 'nx-card mt-3 w-[min(820px,100%)]' : 'hidden'} style={{ minHeight: 0 }}>
        <ChatPanel conversationId={cid} onConversation={setCid} mode={mode} onVoiceState={setVstate} onCaption={onCaption}
          autoSend={cid ? undefined : ask} height="min(52vh, 560px)"
          starters={["What's happening in the world today?", 'Remind me to study thermodynamics tomorrow at 6 PM', 'Explain the second law of thermodynamics']} />
      </div>

      <div className="fixed flex gap-2" style={{ bottom: 'max(16px, env(safe-area-inset-bottom))', left: '50%', transform: 'translateX(-50%)' }}>
        <button type="button" onClick={() => setTyping(t => !t)} aria-pressed={typing} aria-label={typing ? 'Hide keyboard and chat' : 'Type instead'} title={typing ? 'Back to voice' : 'Type instead'}
          className="grid h-10 w-10 place-items-center rounded-full border" style={{ background: typing ? 'var(--blue)' : 'rgba(14,26,51,.85)', borderColor: typing ? 'var(--blue)' : 'var(--line)', color: typing ? '#fff' : 'var(--dim)' }}>
          <Keyboard size={18} />
        </button>
        {cid && !typing && <button type="button" onClick={() => { setCid(null); setCaption(null); }} className="nx-btn sm ghost" style={{ borderRadius: 999 }}>New conversation</button>}
        {!status && <button type="button" onClick={() => navigate('/')} className="nx-btn sm ghost" style={{ borderRadius: 999 }}>Classic OpenJarvis</button>}
      </div>
    </div>
  );
}
