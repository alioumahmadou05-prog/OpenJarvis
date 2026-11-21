import { useCallback, useEffect, useState } from 'react';
import { NavLink, Route, Routes, useNavigate, useSearchParams } from 'react-router';
import {
  Bell, BookOpen, BrainCircuit, CalendarClock, Globe2, History, Home, Inbox, LayoutGrid, Mic, Newspaper, Plug, Settings as Cog, Sparkles, X,
} from 'lucide-react';
import { Orb, type OrbMood } from '../components/Nour/Orb';
import { getBase, authHeaders } from '../lib/api';
import { nx, ago, when, type Job, type Notice, type Reminder, type Site, type Status } from './api';
import { ChatPanel } from './ChatPanel';
import type { VoiceState } from './voice';
import { useVoice } from './useVoice';
import { Btn, Card, NX_CSS, Pill, statusTone } from './ui';
import { BriefingPage, InboxPage, RemindersPage } from './PersonalPages';
import { AcademicPage, HistoryPage, MemoryPage, ResearchPage } from './KnowledgePages';
import { AppsPage, SettingsPage, SitesPage } from './SystemPages';

const NAV = [
  { to: '/jarvis', icon: Home, label: 'Home', end: true },
  { to: '/jarvis/history', icon: History, label: 'Chat history' },
  { to: '/jarvis/voice', icon: Mic, label: 'Voice' },
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

export function JarvisApp() {
  const [status, setStatus] = useState<Status | null>(null);
  const [toasts, setToasts] = useState<Notice[]>([]);
  const [navOpen, setNavOpen] = useState(false);
  const navigate = useNavigate();

  const refreshStatus = useCallback(() => { nx.status().then(setStatus).catch(() => setStatus(null)); }, []);
  useEffect(() => { refreshStatus(); const t = setInterval(refreshStatus, 30000); return () => clearInterval(t); }, [refreshStatus]);

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
    <div className="nx flex h-full min-h-0 w-full">
      <style>{NX_CSS}</style>
      <aside className={`nx-scroll fixed inset-y-0 left-0 z-40 w-60 flex-none overflow-y-auto border-r p-3 transition-transform md:static md:translate-x-0 ${navOpen ? 'translate-x-0' : '-translate-x-full'}`} style={{ background: 'rgba(3,5,11,.96)', borderColor: 'var(--line)' }}>
        <div className="mb-4 flex items-center justify-between px-2 pt-1">
          <div><div className="text-lg font-bold tracking-wide"><span style={{ color: 'var(--cyan)' }}>NxxR</span> JARVIS</div><div className="nx-dim text-[11px]">Your second brain</div></div>
          <button type="button" className="md:hidden" aria-label="Close menu" onClick={() => setNavOpen(false)}><X size={18} /></button>
        </div>
        <nav className="grid gap-0.5" aria-label="JARVIS">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setNavOpen(false)}
              className={({ isActive }) => `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm no-underline ${isActive ? 'font-medium' : ''}`}
              style={({ isActive }) => ({ color: isActive ? 'var(--hot)' : 'var(--dim)', background: isActive ? 'rgba(47,140,255,.16)' : 'transparent' })}>
              <n.icon size={16} /> {n.label}
              {n.label === 'Reminders' && !!status?.counts.reminders_pending && <span className="nx-mono ml-auto text-[11px]">{status.counts.reminders_pending}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 grid gap-1.5 px-2 text-xs">
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: status?.internet ? 'var(--good)' : status?.internet === false ? 'var(--bad)' : 'var(--dim)' }} /> {status?.internet ? 'Internet connected' : status?.internet === false ? 'No internet' : 'Checking internet…'}</span>
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: status ? 'var(--good)' : 'var(--bad)' }} /> {status ? `Brain: ${status.model || 'default'}` : 'JARVIS server offline'}</span>
          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: status?.scheduler ? 'var(--good)' : 'var(--dim)' }} /> {status?.scheduler ? 'Reminders & monitoring on' : 'Scheduler off'}</span>
          <button type="button" className="nx-dim mt-2 text-left underline" onClick={() => navigate('/')}>Open classic OpenJarvis</button>
        </div>
      </aside>
      {navOpen && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setNavOpen(false)} />}
      <main className="nx-scroll min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b px-4 py-2 md:hidden" style={{ background: 'rgba(3,5,11,.9)', borderColor: 'var(--line)' }}>
          <button type="button" aria-label="Open menu" onClick={() => setNavOpen(true)} className="nx-btn sm">☰</button>
          <span className="font-semibold"><span style={{ color: 'var(--cyan)' }}>NxxR</span> JARVIS</span>
        </div>
        <div className="mx-auto w-full max-w-6xl px-4 py-5 md:px-6">
          {!status && <div className="nx-card mb-4 text-sm" style={{ borderColor: 'rgba(255,125,154,.4)' }}>The JARVIS server isn't answering. Start OpenJarvis (<code>jarvis serve</code>), or open the desktop app, then reload.</div>}
          <Routes>
            <Route index element={<HomePage status={status} />} />
            <Route path="voice" element={<VoicePage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="briefing" element={<BriefingPage />} />
            <Route path="inbox" element={<InboxPage />} />
            <Route path="reminders" element={<RemindersPage />} />
            <Route path="academic" element={<AcademicPage />} />
            <Route path="research" element={<ResearchPage />} />
            <Route path="sites" element={<SitesPage />} />
            <Route path="memory" element={<MemoryPage />} />
            <Route path="apps" element={<AppsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Routes>
        </div>
      </main>
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

export const MODE_LIST: [string, string][] = [
  ['companion', 'Sarcastic companion'], ['normal', 'Normal'], ['tutor', 'Academic tutor'], ['research', 'Research'],
  ['social', 'Social & dating'], ['professional', 'Professional'], ['news', 'News briefing'],
];

function moodOf(s: VoiceState, busy = false): OrbMood {
  return s === 'speaking' ? 'speaking' : s === 'thinking' || busy ? 'thinking' : s === 'hearing' || s === 'listening' ? 'listening' : 'idle';
}

function useConversationParam(): [string | null, (id: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const cid = params.get('c');
  return [cid, id => setParams(p => { const n = new URLSearchParams(p); if (id) n.set('c', id); else n.delete('c'); return n; }, { replace: true })];
}

function HomePage({ status }: { status: Status | null }) {
  const [cid, setCid] = useConversationParam();
  const [mode, setMode] = useState(() => localStorage.getItem('nx.mode') || 'companion');
  const [vstate, setVstate] = useState<VoiceState>('off');
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const ask = params.get('ask') || undefined;
  useEffect(() => { localStorage.setItem('nx.mode', mode); }, [mode]);
  const load = useCallback(() => {
    nx.reminders('pending').then(r => setReminders(r.reminders.slice(0, 5))).catch(() => {});
    nx.notifications(true).then(r => setNotices(r.notifications.slice(0, 5))).catch(() => {});
    nx.jobs().then(r => setJobs(r.jobs.slice(0, 4))).catch(() => {});
    nx.sites().then(r => setSites(r.sites)).catch(() => {});
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Still awake. Bold.' : hour < 12 ? 'Good morning.' : hour < 18 ? 'Good afternoon.' : 'Good evening.';

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid min-w-0 content-start gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="w-28 flex-none sm:w-36" style={{ aspectRatio: '1' }}><Orb mood={moodOf(vstate)} palette="blue" /></div>
          <div className="min-w-0 flex-1">
            <div className="nx-eyebrow">{vstate === 'off' ? 'Ready' : vstate}</div>
            <h1 className="m-0 text-2xl font-semibold">{greet}</h1>
            <p className="nx-dim m-0 text-sm">Ask me anything, or press the microphone and just talk.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="nx-input" style={{ width: 'auto' }} value={mode} onChange={e => setMode(e.target.value)} aria-label="Mode">{MODE_LIST.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <Btn onClick={() => setCid(null)}><Sparkles size={14} className="mr-1 inline" />New chat</Btn>
          </div>
        </div>
        <Card>
          <ChatPanel key={ask || 'chat'} conversationId={cid} onConversation={setCid} mode={params.get('mode') || mode} onVoiceState={setVstate} autoSend={cid ? undefined : ask}
            starters={["What's happening in the world today?", 'Explain the second law of thermodynamics', 'Remind me to study thermodynamics tomorrow at 6 PM', 'Should I text her? She said I\'m funny.', 'What is the price of gold right now?']} />
        </Card>
      </div>
      <div className="grid content-start gap-4">
        <Card title="Today" action={<Btn variant="sm" onClick={() => navigate('/jarvis/briefing')}>Briefing</Btn>}>
          {reminders.length ? <ul className="m-0 grid list-none gap-2 p-0">{reminders.map(r => <li key={r.id} className="text-sm"><span className="nx-mono nx-dim text-xs">{when(r.due_at)}</span><br />{r.text}</li>)}</ul> : <p className="nx-dim m-0 text-sm">No upcoming reminders. Suspiciously calm.</p>}
        </Card>
        <Card title="Notifications" action={notices.length ? <Btn variant="sm ghost" onClick={() => { void nx.readAll().then(load); }}>Clear</Btn> : undefined}>
          {notices.length ? <ul className="m-0 grid list-none gap-2 p-0">{notices.map(n => <li key={n.id} className="text-sm"><b>{n.title}</b>{n.body && <span className="nx-dim"> · {n.body.slice(0, 90)}</span>}<br /><span className="nx-dim text-xs">{ago(n.created_at)}</span></li>)}</ul> : <p className="nx-dim m-0 text-sm">Nothing new.</p>}
        </Card>
        <Card title="Activity">
          {jobs.length ? <ul className="m-0 grid list-none gap-2 p-0">{jobs.map(j => <li key={j.id} className="text-sm"><Pill tone={j.status === 'done' ? 'good' : j.status === 'failed' ? 'bad' : 'blue'}>{j.status}</Pill> {j.kind.replace('_', ' ')}: {j.input.slice(0, 50)}<br /><span className="nx-dim text-xs">{j.status === 'running' ? j.progress : ago(j.finished_at || j.created_at)}</span></li>)}</ul> : <p className="nx-dim m-0 text-sm">No background tasks. Ask for research and I'll work on it here.</p>}
        </Card>
        <Card title="Connections">
          <div className="grid gap-1.5 text-sm">
            <span>Internet: <Pill tone={status?.internet ? 'good' : 'bad'}>{status?.internet ? 'online' : 'offline'}</Pill></span>
            <span>Memory: {status?.counts.memories ?? 0} facts · History: {status?.counts.conversations ?? 0} chats</span>
            {sites.slice(0, 4).map(s => <span key={s.id}>{s.name}: <Pill tone={statusTone(s.status)}>{s.status}</Pill></span>)}
            <button type="button" className="nx-dim text-left text-xs underline" onClick={() => navigate('/jarvis/apps')}>Gmail, Calendar and other apps →</button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function VoicePage() {
  const [cid, setCid] = useConversationParam();
  const [mode, setMode] = useState(() => localStorage.getItem('nx.mode') || 'companion');
  const [vstate, setVstate] = useState<VoiceState>('off');
  const voice = useVoice();
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card className="grid justify-items-center gap-3 py-6">
        <div className="w-[min(360px,80vw)]" style={{ aspectRatio: '1' }}><Orb mood={moodOf(vstate)} palette="blue" /></div>
        <div className="nx-eyebrow">{vstate === 'off' ? 'Tap start and talk' : vstate}</div>
        <Btn variant={voice.active ? 'danger' : 'primary'} className="px-8 py-3 text-base" onClick={() => voice.active ? voice.engine.stop() : void voice.engine.start()}>{voice.active ? 'End conversation' : 'Start conversation'}</Btn>
        <select className="nx-input" style={{ width: 'auto' }} value={mode} onChange={e => { setMode(e.target.value); localStorage.setItem('nx.mode', e.target.value); }} aria-label="Mode">{MODE_LIST.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <p className="nx-dim m-0 max-w-md text-center text-sm">Speak naturally; I answer when you pause, and you can interrupt me. Headphones stop me from hearing myself. Change voice, speed and wake word in Settings.</p>
      </Card>
      <Card title="Live transcript">
        <ChatPanel conversationId={cid} onConversation={setCid} mode={mode} onVoiceState={setVstate} height="min(70vh, 640px)" />
      </Card>
    </div>
  );
}
