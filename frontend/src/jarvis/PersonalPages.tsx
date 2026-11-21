import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Copy, Mail, RefreshCw } from 'lucide-react';
import { nx, when, type Collected, type Reminder, type Settings } from './api';
import { ChatPanel } from './ChatPanel';
import { Btn, Card, Empty, ErrorText, Field, Input, PageTitle, Pill, Select, Textarea } from './ui';

/* ------------------------------------------------------------------ Briefing */
export function BriefingPage() {
  const [cid, setCid] = useState<string | null>(null);
  const [run, setRun] = useState(0);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [topics, setTopics] = useState('');
  const [saved, setSaved] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { nx.settings().then(s => { setSettings(s); setTopics(s.briefing_topics.join('\n')); }).catch(e => setError(e.message)); }, []);
  const save = async (patch: Partial<Settings>) => {
    try { const s = await nx.saveSettings(patch); setSettings(s); setSaved('Saved.'); setTimeout(() => setSaved(''), 2000); } catch (e) { setError((e as Error).message); }
  };
  return (
    <>
      <PageTitle eyebrow="Daily briefing" title="What's happening today" sub="Your schedule, emails, reminders, websites and the news, from live data. Say “JARVIS, what's happening today?” any time.">
        <Btn variant="primary" onClick={() => { setCid(null); setRun(r => r + 1); }}>{run ? 'Brief me again' : 'Brief me now'}</Btn>
      </PageTitle>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          {run ? <ChatPanel key={run} conversationId={cid} onConversation={setCid} mode="briefing" autoSend="What's happening today? Give me my briefing." height="min(68vh, 700px)" />
            : <Empty>Press “Brief me now”. I'll check your reminders, calendar, email, websites and the news, then tell you what matters.</Empty>}
        </Card>
        <Card title="Every morning">
          {settings && (
            <div className="grid gap-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.briefing_enabled} onChange={e => void save({ briefing_enabled: e.target.checked })} /> Notify me when my briefing is ready</label>
              <Field label="Time"><Input type="time" value={settings.briefing_time} onChange={e => void save({ briefing_time: e.target.value })} /></Field>
              <Field label="News topics (one per line, up to 6)"><Textarea rows={5} value={topics} onChange={e => setTopics(e.target.value)} onBlur={() => void save({ briefing_topics: topics.split('\n') })} /></Field>
              <p className="nx-dim m-0 text-xs">Runs while the JARVIS server is on (the desktop app keeps it running). Email and calendar appear once connected in Connected apps.</p>
              <span className="text-xs" style={{ color: 'var(--good)' }}>{saved}</span>
            </div>
          )}
          <ErrorText error={error} />
        </Card>
      </div>
    </>
  );
}

/* --------------------------------------------------------------------- Inbox */
export function InboxPage() {
  const [tab, setTab] = useState<'email' | 'calendar'>('email');
  const [data, setData] = useState<Collected | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ to: string; about: string; context: string } | null>(null);
  const navigate = useNavigate();
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(tab === 'email' ? await nx.email(72) : await nx.calendar(24)); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [tab]);
  useEffect(() => { setData(null); void load(); }, [load]);
  const triage = async () => { try { await nx.startJob('email_triage', 'Focus on university and deadlines.'); navigate('/jarvis/research'); } catch (e) { setError((e as Error).message); } };

  return (
    <>
      <PageTitle eyebrow="Email & calendar" title={tab === 'email' ? 'Your inbox' : 'Your schedule'} sub="Read and prepare only: JARVIS drafts, you send. Nothing is sent or changed without you.">
        <div className="flex gap-1 rounded-full border p-0.5" style={{ borderColor: 'var(--line)' }}>
          {(['email', 'calendar'] as const).map(t => <button key={t} type="button" onClick={() => setTab(t)} className="rounded-full px-3 py-1 text-sm capitalize" style={{ background: tab === t ? 'rgba(47,140,255,.18)' : 'transparent', color: tab === t ? 'var(--hot)' : 'var(--dim)' }}>{t}</button>)}
        </div>
        <Btn onClick={() => void load()} disabled={loading}><RefreshCw size={14} className="mr-1 inline" />Refresh</Btn>
        {tab === 'email' ? <Btn variant="primary" onClick={() => void triage()} disabled={!data?.connected.length}>Find what's urgent</Btn>
          : <Btn variant="primary" onClick={() => navigate(`/jarvis?mode=professional&ask=${encodeURIComponent("Look at my calendar for today and this week and find good slots for studying. Then suggest a plan.")}`)}>Find time to study</Btn>}
      </PageTitle>
      <ErrorText error={error} />
      {loading && !data && <Card><p className="nx-dim m-0">Reading…</p></Card>}
      {data && !data.connected.length && (
        <Card title={`No ${tab === 'email' ? 'email account' : 'calendar'} connected`}>
          <p className="nx-dim mt-0 text-sm">Connect {tab === 'email' ? 'Gmail (or Outlook)' : 'Google Calendar (or Apple Calendar on a Mac)'} with a secure sign-in. Your password never passes through JARVIS.</p>
          <Btn variant="primary" onClick={() => navigate('/data-sources')}>Connect {tab === 'email' ? 'Gmail' : 'Calendar'}</Btn>
        </Card>
      )}
      {data && !!data.connected.length && (
        <Card title={`${data.items.length} item(s) from ${data.connected.join(', ')}`}>
          {!data.items.length ? <Empty>Nothing in this period.</Empty> : (
            <ul className="m-0 grid list-none gap-0 p-0">
              {data.items.map((i, k) => (
                <li key={k} className="grid gap-1 border-b py-3 text-sm sm:grid-cols-[1fr_auto]" style={{ borderColor: 'var(--line)' }}>
                  <div className="min-w-0"><b>{i.title}</b>{i.author && <span className="nx-dim"> · {i.author}</span>}<br /><span className="nx-dim">{i.snippet.slice(0, 220)}</span></div>
                  <div className="flex items-start gap-2 sm:flex-col sm:items-end"><span className="nx-mono nx-dim text-xs">{when(i.time)}</span>
                    {tab === 'email' && <Btn variant="sm" onClick={() => setDraft({ to: i.author, about: `Reply to: ${i.title}`, context: i.snippet })}>Draft reply</Btn>}
                    {i.url && <a className="text-xs" href={i.url} target="_blank" rel="noreferrer">Open</a>}</div>
                </li>
              ))}
            </ul>
          )}
          {!!data.errors.length && <p className="text-xs" style={{ color: 'var(--warn)' }}>{data.errors.join(' · ')}</p>}
        </Card>
      )}
      <Card title="Write an email" className="mt-4" action={<Btn variant="sm" onClick={() => setDraft({ to: '', about: '', context: '' })}>New draft</Btn>}>
        {draft ? <DraftBox initial={draft} onClose={() => setDraft(null)} /> : <p className="nx-dim m-0 text-sm">JARVIS writes the draft; you review and send it from your mail app.</p>}
      </Card>
    </>
  );
}

function DraftBox({ initial, onClose }: { initial: { to: string; about: string; context: string }; onClose: () => void }) {
  const [f, setF] = useState({ ...initial, style: 'professional' });
  const [out, setOut] = useState<{ subject: string; body: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => { setBusy(true); setError(null); try { setOut(await nx.draftEmail(f)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } };
  const mailto = out ? `mailto:${encodeURIComponent(f.to.match(/[\w.+-]+@[\w.-]+/)?.[0] || '')}?subject=${encodeURIComponent(out.subject)}&body=${encodeURIComponent(out.body)}` : '';
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-3"><Field label="To"><Input value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /></Field>
        <Field label="About"><Input value={f.about} onChange={e => setF({ ...f, about: e.target.value })} placeholder="e.g. ask for an assignment extension" /></Field>
        <Field label="Style"><Select value={f.style} onChange={e => setF({ ...f, style: e.target.value })}>{['professional', 'friendly', 'formal academic', 'short and direct', 'apologetic'].map(s => <option key={s}>{s}</option>)}</Select></Field></div>
      <Field label="Context (optional)"><Textarea rows={3} value={f.context} onChange={e => setF({ ...f, context: e.target.value })} /></Field>
      <div className="flex gap-2"><Btn variant="primary" disabled={busy || !f.about.trim()} onClick={() => void go()}>{busy ? 'Writing…' : 'Draft it'}</Btn><Btn variant="ghost" onClick={onClose}>Close</Btn></div>
      <ErrorText error={error} />
      {out && (
        <div className="grid gap-2 rounded-xl border p-3" style={{ borderColor: 'var(--line)' }}>
          <b>{out.subject}</b><p className="m-0 whitespace-pre-wrap text-sm">{out.body}</p>
          <div className="flex flex-wrap gap-2"><Btn variant="sm" onClick={() => void navigator.clipboard.writeText(`${out.subject}\n\n${out.body}`)}><Copy size={13} className="mr-1 inline" />Copy</Btn>
            <a className="nx-btn sm no-underline" href={mailto}><Mail size={13} className="mr-1 inline" />Open in mail app</a></div>
          <p className="nx-dim m-0 text-xs">Prepared only. Nothing was sent.</p>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- Reminders */
const toLocalInput = (ts: number) => { const d = new Date(ts * 1000); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export function RemindersPage() {
  const [list, setList] = useState<Reminder[]>([]);
  const [text, setText] = useState('');
  const [due, setDue] = useState(() => toLocalInput(Date.now() / 1000 + 3600));
  const [rec, setRec] = useState('none');
  const [error, setError] = useState<string | null>(null);
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  const load = useCallback(() => { nx.reminders().then(r => setList(r.reminders)).catch(e => setError(e.message)); }, []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);
  const add = async () => { setError(null); try { await nx.addReminder(text, due, rec); setText(''); load(); } catch (e) { setError((e as Error).message); } };
  const pending = list.filter(r => r.status === 'pending'), past = list.filter(r => r.status !== 'pending').slice(0, 30);
  return (
    <>
      <PageTitle eyebrow="Reminders" title="Don't rely on your memory" sub="Or just say: “JARVIS, remind me to study thermodynamics tomorrow at 6 PM.” Reminders fire even when this window is closed, as long as the JARVIS server runs.">
        {perm !== 'granted' && typeof Notification !== 'undefined' && <Btn onClick={() => void Notification.requestPermission().then(setPerm)}>Allow notifications</Btn>}
      </PageTitle>
      <Card title="New reminder">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
          <Field label="What"><Input value={text} onChange={e => setText(e.target.value)} placeholder="Chemistry assignment due" onKeyDown={e => e.key === 'Enter' && text && void add()} /></Field>
          <Field label="When"><Input type="datetime-local" value={due} onChange={e => setDue(e.target.value)} /></Field>
          <Field label="Repeat"><Select value={rec} onChange={e => setRec(e.target.value)}>{['none', 'daily', 'weekdays', 'weekly', 'monthly'].map(r => <option key={r} value={r}>{r === 'none' ? 'Once' : r}</option>)}</Select></Field>
          <Btn variant="primary" disabled={!text.trim()} onClick={() => void add()}>Add</Btn>
        </div>
        <ErrorText error={error} />
      </Card>
      <Card title={`Upcoming (${pending.length})`} className="mt-4">
        {!pending.length ? <Empty>Nothing scheduled.</Empty> : <ul className="m-0 grid list-none gap-0 p-0">{pending.map(r => <ReminderRow key={r.id} r={r} onChange={load} />)}</ul>}
      </Card>
      {!!past.length && <Card title="Done & cancelled" className="mt-4"><ul className="m-0 grid list-none gap-0 p-0">{past.map(r => <ReminderRow key={r.id} r={r} onChange={load} />)}</ul></Card>}
    </>
  );
}

function ReminderRow({ r, onChange }: { r: Reminder; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [due, setDue] = useState(toLocalInput(r.due_at));
  const act = (p: Parameters<typeof nx.patchReminder>[1]) => nx.patchReminder(r.id, p).then(onChange);
  return (
    <li className="flex flex-wrap items-center gap-2 border-b py-2.5 text-sm" style={{ borderColor: 'var(--line)' }}>
      <span className="nx-mono w-36 flex-none text-xs" style={{ color: r.status === 'pending' && r.due_at < Date.now() / 1000 ? 'var(--warn)' : 'var(--dim)' }}>{when(r.due_at)}</span>
      <span className="min-w-0 flex-1">{r.text} {r.recurrence !== 'none' && <Pill tone="blue">{r.recurrence}</Pill>} {r.source === 'jarvis' && <Pill>set by voice/chat</Pill>} {r.status !== 'pending' && <Pill>{r.status}</Pill>}</span>
      {editing ? <><Input type="datetime-local" value={due} onChange={e => setDue(e.target.value)} /><Btn variant="sm primary" onClick={() => void act({ due }).then(() => setEditing(false))}>Save</Btn></>
        : r.status === 'pending' ? <><Btn variant="sm" onClick={() => setEditing(true)}>Reschedule</Btn><Btn variant="sm" onClick={() => void act({ status: 'done' })}>Done</Btn><Btn variant="sm ghost" onClick={() => void act({ status: 'cancelled' })}>Cancel</Btn></>
        : <Btn variant="sm ghost" onClick={() => void nx.deleteReminder(r.id).then(onChange)}>Delete</Btn>}
    </li>
  );
}
