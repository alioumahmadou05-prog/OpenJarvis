import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Archive, ArchiveRestore, Pencil, Trash2 } from 'lucide-react';
import { getBase, authHeaders } from '../lib/api';
import { nx, ago, groupByDate, type Conversation, type Job, type Memory, type Report } from './api';
import { ChatPanel } from './ChatPanel';
import { Btn, Card, Empty, ErrorText, Field, Input, Markdown, PageTitle, Pill, Textarea } from './ui';

/* ------------------------------------------------------------------- History */
export function HistoryPage() {
  const [q, setQ] = useState('');
  const [archived, setArchived] = useState(false);
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [hits, setHits] = useState<{ id: string; conversation_id: string; title: string; content: string; created_at: number }[]>([]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const navigate = useNavigate();
  const load = useCallback(() => {
    nx.conversations(q, archived).then(r => setConvs(r.conversations)).catch(() => {});
    if (q.length >= 2) nx.search(q).then(r => setHits(r.results.slice(0, 20))).catch(() => {}); else setHits([]);
  }, [q, archived]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const open = (id: string) => navigate(`/jarvis?c=${id}`);
  return (
    <>
      <PageTitle eyebrow="Chat history" title="Everything we've talked about" sub="Voice conversations are saved as transcripts. Open one to continue where you left off.">
        <Btn onClick={() => setArchived(a => !a)}>{archived ? 'Show active' : 'Show archived'}</Btn>
        <Btn variant="primary" onClick={() => navigate('/jarvis')}>New chat</Btn>
      </PageTitle>
      <Card><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search titles and messages…" aria-label="Search history" /></Card>
      {!!hits.length && (
        <Card title="Matching messages" className="mt-4">
          <ul className="m-0 grid list-none gap-2 p-0">{hits.map(h => <li key={h.id}><button type="button" className="w-full text-left text-sm" onClick={() => open(h.conversation_id)}><b>{h.title}</b> <span className="nx-dim text-xs">{ago(h.created_at)}</span><br /><span className="nx-dim">{h.content.slice(0, 180)}</span></button></li>)}</ul>
        </Card>
      )}
      <div className="mt-4 grid gap-4">
        {!convs.length && <Empty>{archived ? 'No archived conversations.' : 'No conversations yet. Say hello on the Home page.'}</Empty>}
        {groupByDate(convs).map(g => (
          <Card key={g.label} title={g.label}>
            <ul className="m-0 grid list-none gap-0 p-0">
              {g.items.map(c => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 border-b py-2 text-sm" style={{ borderColor: 'var(--line)' }}>
                  {renaming === c.id ? (
                    <form className="flex flex-1 gap-2" onSubmit={e => { e.preventDefault(); void nx.patchConversation(c.id, { title: name }).then(() => { setRenaming(null); load(); }); }}>
                      <Input value={name} onChange={e => setName(e.target.value)} autoFocus /><Btn variant="sm primary" type="submit">Save</Btn></form>
                  ) : <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => open(c.id)}>{c.title} <span className="nx-dim text-xs">· {ago(c.updated_at)}</span></button>}
                  <button type="button" aria-label="Rename" title="Rename" className="nx-dim" onClick={() => { setRenaming(c.id); setName(c.title); }}><Pencil size={15} /></button>
                  <button type="button" aria-label={archived ? 'Unarchive' : 'Archive'} title={archived ? 'Unarchive' : 'Archive'} className="nx-dim" onClick={() => void nx.patchConversation(c.id, { archived: !archived }).then(load)}>{archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}</button>
                  <button type="button" aria-label="Delete" title="Delete" style={{ color: confirmDel === c.id ? 'var(--bad)' : 'var(--dim)' }}
                    onClick={() => { if (confirmDel !== c.id) { setConfirmDel(c.id); setTimeout(() => setConfirmDel(null), 3000); return; } void nx.deleteConversation(c.id).then(load); }}>
                    {confirmDel === c.id ? <span className="text-xs">Click to delete</span> : <Trash2 size={15} />}</button>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------- Memory */
export function MemoryPage() {
  const [q, setQ] = useState('');
  const [list, setList] = useState<Memory[]>([]);
  const [text, setText] = useState('');
  const [cat, setCat] = useState('general');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { nx.memories(q).then(r => setList(r.memories)).catch(e => setError(e.message)); }, [q]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  const exportData = async () => {
    const res = await fetch(`${getBase()}${nx.exportUrl}`, { headers: authHeaders() });
    const a = document.createElement('a'); a.href = URL.createObjectURL(await res.blob()); a.download = 'nxxr-jarvis-export.json'; a.click();
  };
  return (
    <>
      <PageTitle eyebrow="Memory" title="What JARVIS knows about you" sub="I only keep lasting, useful facts (studies, projects, goals, preferences, deadlines). Correct or delete anything; it's your memory.">
        <Btn onClick={() => void exportData()}>Export all my data</Btn>
        <Btn variant="danger" onClick={() => { if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 4000); return; } void nx.clearMemories().then(load); setArmed(false); }}>{armed ? 'Click again to erase all' : 'Forget everything'}</Btn>
      </PageTitle>
      <Card>
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
          <Field label="Teach me something"><Input value={text} onChange={e => setText(e.target.value)} placeholder="I study Chemical Engineering, 300 level" /></Field>
          <Field label="Category"><Input value={cat} onChange={e => setCat(e.target.value)} list="nx-cats" /></Field>
          <Btn variant="primary" disabled={!text.trim()} onClick={() => void nx.addMemory(text, cat).then(() => { setText(''); load(); }).catch(e => setError(e.message))}>Remember</Btn>
        </div>
        <datalist id="nx-cats">{['academic', 'projects', 'goals', 'preferences', 'deadlines', 'people', 'style', 'general'].map(c => <option key={c} value={c} />)}</datalist>
        <div className="mt-3"><Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search memories…" aria-label="Search memories" /></div>
        <ErrorText error={error} />
      </Card>
      <Card className="mt-4" title={`${list.length} memories`}>
        {!list.length ? <Empty>Nothing yet. Tell me about yourself in a chat, or add a fact above.</Empty> : (
          <ul className="m-0 grid list-none gap-0 p-0">{list.map(m => (
            <li key={m.id} className="flex flex-wrap items-center gap-2 border-b py-2 text-sm" style={{ borderColor: 'var(--line)' }}>
              <Pill tone="blue">{m.category}</Pill>
              {editing === m.id ? <form className="flex flex-1 gap-2" onSubmit={e => { e.preventDefault(); void nx.editMemory(m.id, { text: draft }).then(() => { setEditing(null); load(); }); }}><Input value={draft} onChange={e => setDraft(e.target.value)} autoFocus /><Btn variant="sm primary" type="submit">Save</Btn></form>
                : <span className="min-w-0 flex-1">{m.text} <span className="nx-dim text-xs">· {m.source === 'jarvis' ? 'learned in chat' : 'added by you'} · {ago(m.updated_at)}</span></span>}
              <button type="button" aria-label="Edit" className="nx-dim" onClick={() => { setEditing(m.id); setDraft(m.text); }}><Pencil size={15} /></button>
              <button type="button" aria-label="Delete" className="nx-dim" onClick={() => void nx.deleteMemory(m.id).then(load)}><Trash2 size={15} /></button>
            </li>))}</ul>
        )}
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ Research */
export function ResearchPage() {
  const [topic, setTopic] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [open, setOpen] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    nx.jobs().then(r => setJobs(r.jobs)).catch(() => {});
    nx.reports().then(r => setReports(r.reports)).catch(() => {});
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, [load]);
  useEffect(() => { const m = location.hash.match(/^#report\/(\w+)/); if (m) void nx.report(m[1]).then(setOpen); }, []);
  const start = async (kind: string, input: string) => { setError(null); try { await nx.startJob(kind, input); setTopic(''); load(); } catch (e) { setError((e as Error).message); } };
  return (
    <>
      <PageTitle eyebrow="Web research" title="Send JARVIS to find out" sub="Multi-step research in the background: search several angles, read the articles, compare them and write a cited report. You'll get a notification when it's done." />
      <Card>
        <form className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={e => { e.preventDefault(); if (topic.trim()) void start('research', topic); }}>
          <Field label="Research topic"><Input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Latest developments in chemical engineering this month" /></Field>
          <Btn variant="primary" type="submit" disabled={!topic.trim()}>Start research</Btn>
        </form>
        <div className="mt-3 flex flex-wrap gap-2">
          {['Five universities offering a master\'s in petrochemical engineering', 'What happened in the oil and gas industry this week', 'Latest technological discoveries this month'].map(t => <button key={t} type="button" className="nx-pill blue" style={{ background: 'transparent', padding: '5px 11px', cursor: 'pointer' }} onClick={() => void start('research', t)}>{t}</button>)}
          <Btn variant="sm" onClick={() => void start('site_audit', '')}>Check my websites</Btn>
          <Btn variant="sm" onClick={() => void start('email_triage', '')}>Triage my email</Btn>
        </div>
        <ErrorText error={error} />
      </Card>
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="grid content-start gap-4">
          <Card title="Tasks">
            {!jobs.length ? <Empty>No tasks yet.</Empty> : <ul className="m-0 grid list-none gap-2 p-0">{jobs.slice(0, 15).map(j => (
              <li key={j.id} className="border-b pb-2 text-sm" style={{ borderColor: 'var(--line)' }}>
                <div className="flex items-center gap-2"><Pill tone={j.status === 'done' ? 'good' : j.status === 'failed' ? 'bad' : j.status === 'cancelled' ? '' : 'blue'}>{j.status}</Pill><span className="min-w-0 flex-1 truncate">{j.input || j.kind.replace('_', ' ')}</span>
                  {(j.status === 'running' || j.status === 'queued') && <Btn variant="sm ghost" onClick={() => void nx.cancelJob(j.id).then(load)}>Cancel</Btn>}
                  {j.report_id && <Btn variant="sm" onClick={() => void nx.report(j.report_id!).then(setOpen)}>Open</Btn>}</div>
                <span className="nx-dim text-xs">{j.status === 'failed' ? j.error : j.progress} · {ago(j.created_at)}</span>
              </li>))}</ul>}
          </Card>
          <Card title="Saved reports">
            {!reports.length ? <Empty>Finished reports appear here.</Empty> : <ul className="m-0 grid list-none gap-1 p-0">{reports.map(r => <li key={r.id} className="flex items-center gap-2 text-sm"><button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => void nx.report(r.id).then(setOpen)}>{r.title}</button><span className="nx-dim text-xs">{ago(r.created_at)}</span><button type="button" aria-label="Delete report" className="nx-dim" onClick={() => void nx.deleteReport(r.id).then(load)}><Trash2 size={14} /></button></li>)}</ul>}
          </Card>
        </div>
        <Card title={open ? open.title : 'Report'}>
          {open ? (
            <div className="grid gap-3">
              <Markdown text={open.body} />
              {!!open.sources.length && <div><div className="nx-eyebrow mb-1">Sources</div><ol className="m-0 grid gap-1 pl-5 text-sm">{open.sources.map((s, i) => <li key={i}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>{s.date && <span className="nx-dim"> · {s.date}</span>}</li>)}</ol></div>}
            </div>
          ) : <Empty>Open a finished task to read its report.</Empty>}
        </Card>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Academic */
const SUBJECTS = ['Thermodynamics', 'Fluid Mechanics', 'Heat Transfer', 'Mass Transfer', 'Reaction Engineering', 'Process Control', 'Material Science', 'Petrochemicals', 'Engineering Maths', 'Physical Chemistry', 'Organic Chemistry', 'Academic Writing'];
export function AcademicPage() {
  const [cid, setCid] = useState<string | null>(null);
  const [subject, setSubject] = useState('Thermodynamics');
  const [ask, setAsk] = useState<string | undefined>();
  const [n, setN] = useState(0);
  const [notes, setNotes] = useState('');
  const tool = (prompt: string) => { setCid(null); setAsk(prompt); setN(x => x + 1); };
  return (
    <>
      <PageTitle eyebrow="Academic assistant" title="Your engineering tutor" sub="Step-by-step solutions with units, explanations at your level, quizzes, flashcards, revision plans and assignment checks. Formulas and numbers are never invented." />
      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="grid content-start gap-4">
          <Card title="Subject"><div className="flex flex-wrap gap-1.5">{SUBJECTS.map(s => <button key={s} type="button" onClick={() => setSubject(s)} className="nx-pill" style={{ cursor: 'pointer', background: subject === s ? 'rgba(47,140,255,.18)' : 'transparent', color: subject === s ? 'var(--hot)' : undefined }}>{s}</button>)}</div></Card>
          <Card title="Tools">
            <div className="grid gap-2">
              <Btn onClick={() => tool(`Explain the core ideas of ${subject} from the basics up to university level, with one worked example.`)}>Explain the topic</Btn>
              <Btn onClick={() => tool(`Give me one exam-style ${subject} problem. Wait for my attempt, then correct it step by step.`)}>Practice problem</Btn>
              <Btn onClick={() => tool(`Make 10 flashcards on ${subject} (question → answer), one per line.`)}>Flashcards</Btn>
              <Btn onClick={() => tool(`Quiz me on ${subject}: 5 questions, one at a time, harder each time. Wait for each answer.`)}>Quiz me</Btn>
              <Btn onClick={() => tool(`Write concise revision notes on ${subject}: key definitions, formulas with units and when to use them, common mistakes.`)}>Revision notes</Btn>
              <Btn onClick={() => tool(`Build me a realistic exam revision plan for ${subject} and my other courses. Ask me for my exam dates first, then set reminders.`)}>Revision plan + reminders</Btn>
            </div>
          </Card>
          <Card title="Check my work">
            <Textarea rows={5} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Paste a solution, lab report section or lecture-slide text…" />
            <div className="mt-2 flex gap-2"><Btn variant="sm primary" disabled={!notes.trim()} onClick={() => tool(`Check this ${subject} work. Find mistakes in reasoning, formulas, units and arithmetic; show the corrected steps; then grade it out of 10.\n\n${notes}`)}>Correct it</Btn>
              <Btn variant="sm" disabled={!notes.trim()} onClick={() => tool(`Explain this ${subject} material simply, section by section, then give me 3 questions to test my understanding.\n\n${notes}`)}>Explain it</Btn></div>
          </Card>
        </div>
        <Card><ChatPanel key={n} conversationId={cid} onConversation={setCid} mode="tutor" autoSend={ask} web="off"
          starters={[`Solve: 2 kg of water is heated from 25 °C to 80 °C. How much heat is needed?`, `What's the difference between enthalpy and internal energy?`, `Explain the Reynolds number like I'm a beginner`]} /></Card>
      </div>
    </>
  );
}
