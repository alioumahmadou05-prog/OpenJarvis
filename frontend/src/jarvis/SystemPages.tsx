import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Copy, RefreshCw, Trash2 } from 'lucide-react';
import { getBase } from '../lib/api';
import { listConnectors } from '../lib/connectors-api';
import type { ConnectorInfo } from '../types/connectors';
import { nx, ago, type Settings, type Site, type SiteEvent } from './api';
import { browserCanListen, browserCanSpeak, type VoiceSettings } from './voice';
import { getEngine, loadVoiceSettings, saveVoiceSettings } from './useVoice';
import { Btn, Card, Empty, ErrorText, Field, Input, PageTitle, Pill, Select, statusTone } from './ui';

/* --------------------------------------------------------------------- Sites */
const blankSite = { name: '', url: '', health_path: '', auth_method: 'none', auth_header: 'Authorization', token: '', perm_read: true, perm_prepare: false, perm_execute: false, monitor_minutes: 15 };

export function SitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [form, setForm] = useState(blankSite);
  const [adding, setAdding] = useState(false);
  const [sel, setSel] = useState<Site | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const load = useCallback(() => { nx.sites().then(r => { setSites(r.sites); setSel(s => s ? r.sites.find(x => x.id === s.id) || null : null); }).catch(e => setError(e.message)); }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);
  const add = async () => {
    setError(null);
    try { const s = await nx.addSite(form); setForm(blankSite); setAdding(false); load(); setSel(s); } catch (e) { setError((e as Error).message); }
  };
  return (
    <>
      <PageTitle eyebrow="My websites" title="Your projects, watched" sub="JARVIS checks each site on a schedule, reads authorised pages, and (with the bridge snippet) sees the errors and events happening inside your apps.">
        <Btn onClick={() => void nx.startJob('site_audit').then(() => navigate('/jarvis/research'))} disabled={!sites.length}>Audit all sites</Btn>
        <Btn variant="primary" onClick={() => setAdding(a => !a)}>{adding ? 'Close' : 'Add website'}</Btn>
      </PageTitle>
      {adding && (
        <Card title="Register a website or app">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="NxxR Academy" /></Field>
            <Field label="URL"><Input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://… or http://localhost:5500" /></Field>
            <Field label="Health check path (optional)"><Input value={form.health_path} onChange={e => setForm({ ...form, health_path: e.target.value })} placeholder="/api/health" /></Field>
            <Field label="Check every"><Select value={form.monitor_minutes} onChange={e => setForm({ ...form, monitor_minutes: +e.target.value })}>{[[0, 'Never (manual)'], [5, '5 minutes'], [15, '15 minutes'], [60, 'Hour'], [360, '6 hours']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
            <Field label="Authentication"><Select value={form.auth_method} onChange={e => setForm({ ...form, auth_method: e.target.value })}><option value="none">None (public pages)</option><option value="bearer">Bearer token</option><option value="header">API key in a header</option></Select></Field>
            {form.auth_method !== 'none' && <Field label={form.auth_method === 'header' ? 'Header name, then token below' : 'Token'}>{form.auth_method === 'header' && <Input value={form.auth_header} onChange={e => setForm({ ...form, auth_header: e.target.value })} />}<Input type="password" value={form.token} onChange={e => setForm({ ...form, token: e.target.value })} placeholder="Stored locally in a private file; never shown again" /></Field>}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.perm_read} onChange={e => setForm({ ...form, perm_read: e.target.checked })} /> Read: view and summarise pages</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.perm_prepare} onChange={e => setForm({ ...form, perm_prepare: e.target.checked })} /> Prepare: draft changes</label>
            <label className="flex items-center gap-2 opacity-60" title="No site actions are executed automatically in this version"><input type="checkbox" checked={form.perm_execute} onChange={e => setForm({ ...form, perm_execute: e.target.checked })} /> Execute: perform actions (always asks first)</label>
          </div>
          <div className="mt-3 flex gap-2"><Btn variant="primary" disabled={!form.url} onClick={() => void add()}>Register & check</Btn></div>
          <p className="nx-dim mb-0 text-xs">A local HTML file has no address JARVIS can check. Serve it (for example with VS Code Live Server, or <code>python3 -m http.server</code> in its folder) and register that http://localhost address, then add the bridge snippet.</p>
          <ErrorText error={error} />
        </Card>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card title="Connected projects">
          {!sites.length ? <Empty>No websites yet. Add your first one.</Empty> : (
            <div className="grid gap-2">{sites.map(s => (
              <button key={s.id} type="button" onClick={() => setSel(s)} className="grid gap-1 rounded-xl border p-3 text-left text-sm" style={{ borderColor: sel?.id === s.id ? 'var(--blue)' : 'var(--line)', background: 'var(--panel)' }}>
                <span className="flex items-center gap-2"><b className="min-w-0 flex-1 truncate">{s.name}</b><Pill tone={statusTone(s.status)}>{s.status}</Pill></span>
                <span className="nx-dim truncate text-xs">{s.url}</span>
                <span className="nx-dim text-xs">{s.status_code ? `HTTP ${s.status_code} · ` : ''}{s.latency_ms != null ? `${s.latency_ms} ms · ` : ''}checked {ago(s.last_check)}{s.last_event ? ` · last event ${ago(s.last_event)}` : ''}</span>
              </button>))}</div>
          )}
        </Card>
        {sel ? <SiteDetail site={sel} onChange={load} onDeleted={() => { setSel(null); load(); }} /> : <Card title="Details"><Empty>Select a website to see its status, structure, errors and the bridge snippet.</Empty></Card>}
      </div>
    </>
  );
}

function SiteDetail({ site, onChange, onDeleted }: { site: Site; onChange: () => void; onDeleted: () => void }) {
  const [snap, setSnap] = useState<Awaited<ReturnType<typeof nx.snapshot>> | null>(null);
  const [events, setEvents] = useState<SiteEvent[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const navigate = useNavigate();
  useEffect(() => { setSnap(null); nx.siteEvents(site.id).then(r => setEvents(r.events)).catch(() => {}); }, [site.id]);
  const snippet = `<script src="${getBase() || window.location.origin}/v1/nxxr/bridge.js" data-key="${site.bridge_key}"></script>`;
  const run = async (what: string, fn: () => Promise<unknown>) => { setBusy(what); setError(null); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(''); } };
  const authLabel = site.auth_method === 'none' ? 'none' : `${site.auth_method}${site.has_token ? ' (token saved)' : ' (no token)'}`;
  return (
    <Card title={site.name} action={<Pill tone={statusTone(site.status)}>{site.connection}</Pill>}>
      <div className="grid gap-4 text-sm">
        <div className="grid gap-1">
          <span><span className="nx-dim">URL:</span> <a href={site.url} target="_blank" rel="noreferrer">{site.url}</a></span>
          <span><span className="nx-dim">Authentication:</span> {authLabel} · <span className="nx-dim">Permissions:</span> {[site.perm_read && 'read', site.perm_prepare && 'prepare', site.perm_execute && 'execute'].filter(Boolean).join(', ') || 'none'}</span>
          <span><span className="nx-dim">Last check:</span> {ago(site.last_check)} {site.last_error && <span style={{ color: 'var(--bad)' }}>· {site.last_error}</span>}</span>
          {site.page_title && <span><span className="nx-dim">Page title:</span> {site.page_title}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn variant="sm" disabled={!!busy} onClick={() => void run('check', async () => { await nx.checkSite(site.id); onChange(); })}><RefreshCw size={13} className="mr-1 inline" />{busy === 'check' ? 'Checking…' : 'Check now'}</Btn>
          <Btn variant="sm" disabled={!!busy || !site.perm_read} onClick={() => void run('snap', async () => setSnap(await nx.snapshot(site.id)))}>{busy === 'snap' ? 'Reading…' : 'Read structure'}</Btn>
          <Btn variant="sm" onClick={() => navigate(`/jarvis?mode=professional&ask=${encodeURIComponent(`Look at my website "${site.name}" (${site.url}). Status: ${site.status}, ${site.last_error || 'no error'}. Recent errors: ${events.filter(e => e.level === 'error').slice(0, 5).map(e => e.message).join(' | ') || 'none'}. Explain what's happening and how to improve it.`)}`)}>Ask JARVIS about it</Btn>
          <Btn variant="sm danger" onClick={() => { if (!armed) { setArmed(true); setTimeout(() => setArmed(false), 3000); return; } void nx.deleteSite(site.id).then(onDeleted); }}><Trash2 size={13} className="mr-1 inline" />{armed ? 'Click to remove' : 'Remove'}</Btn>
        </div>
        <ErrorText error={error} />
        {snap && (
          <div className="grid gap-2 rounded-xl border p-3" style={{ borderColor: 'var(--line)' }}>
            <b>{snap.title || '(no title)'}</b>{snap.description && <span className="nx-dim">{snap.description}</span>}
            <span className="nx-dim text-xs">{snap.internal_links.length} internal links · {snap.external_links.length} external · {snap.forms} forms</span>
            {!!snap.issues.length && <ul className="m-0 pl-5">{snap.issues.map(i => <li key={i} style={{ color: 'var(--warn)' }}>{i}</li>)}</ul>}
            {!!snap.headings.length && <details><summary className="nx-dim cursor-pointer text-xs">Page outline</summary><ul className="m-0 pl-5 text-xs">{snap.headings.map((h, i) => <li key={i}>{h}</li>)}</ul></details>}
          </div>
        )}
        <div>
          <div className="nx-eyebrow mb-1">Bridge snippet</div>
          <p className="nx-dim mt-0 text-xs">Paste this before <code>&lt;/body&gt;</code> in your site's HTML. It reports JavaScript errors, failing requests and your own <code>NxxR.event("signup")</code> calls to your local JARVIS.</p>
          <div className="flex gap-2"><code className="nx-mono min-w-0 flex-1 overflow-x-auto rounded-lg border p-2 text-[11px]" style={{ borderColor: 'var(--line)', background: 'var(--void)', whiteSpace: 'nowrap' }}>{snippet}</code><Btn variant="sm" onClick={() => void navigator.clipboard.writeText(snippet)}><Copy size={13} /></Btn></div>
        </div>
        <div>
          <div className="nx-eyebrow mb-1">Recent events</div>
          {!events.length ? <p className="nx-dim m-0 text-xs">No events yet. They appear once the bridge snippet is on your site.</p> : (
            <ul className="nx-scroll m-0 grid max-h-64 list-none gap-1 overflow-y-auto p-0 text-xs">{events.map(e => <li key={e.id}><Pill tone={e.level === 'error' ? 'bad' : e.level === 'warn' ? 'warn' : ''}>{e.kind}</Pill> {e.message.slice(0, 160)} <span className="nx-dim">{e.page} · {ago(e.created_at)}</span></li>)}</ul>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------------- Apps */
const IMPORTANT = ['gmail', 'gcalendar', 'outlook', 'apple_calendar', 'google_tasks', 'gdrive', 'notion', 'slack', 'whatsapp', 'news_rss', 'weather', 'github_notifications'];
export function AppsPage() {
  const [list, setList] = useState<ConnectorInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  useEffect(() => { listConnectors().then(setList).catch(e => setError(e.message)); }, []);
  const sorted = [...list].sort((a, b) => (IMPORTANT.indexOf(a.connector_id) + 1 || 99) - (IMPORTANT.indexOf(b.connector_id) + 1 || 99));
  return (
    <>
      <PageTitle eyebrow="Connected apps" title="Your digital world" sub="Connections use each service's official secure sign-in (OAuth) or local access. JARVIS reads and prepares; anything that sends, deletes or changes asks you first.">
        <Btn variant="primary" onClick={() => navigate('/data-sources')}>Connect or manage</Btn>
      </PageTitle>
      <ErrorText error={error} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map(c => (
          <Card key={c.connector_id}>
            <div className="flex items-center justify-between gap-2"><b>{c.display_name}</b><Pill tone={c.connected ? 'good' : ''}>{c.connected ? 'connected' : 'not connected'}</Pill></div>
            <p className="nx-dim mb-0 mt-1 text-xs">{c.auth_type === 'oauth' ? 'Secure sign-in' : c.auth_type === 'local' ? 'Reads from this computer' : c.auth_type === 'token' ? 'API key' : c.auth_type}{c.chunks ? ` · ${c.chunks} items indexed` : ''}</p>
          </Card>
        ))}
        {!list.length && !error && <Empty>Loading connectors…</Empty>}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Settings */
export function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [v, setV] = useState<VoiceSettings>(loadVoiceSettings());
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [caps, setCaps] = useState<{ serverTts: boolean; serverStt: boolean } | null>(null);
  const [audit, setAudit] = useState<{ id: number; at: number; actor: string; action: string; detail: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    nx.settings().then(setS).catch(e => setError(e.message));
    nx.audit().then(r => setAudit(r.audit.slice(0, 40))).catch(() => {});
    void getEngine().capabilities().then(setCaps);
    if (browserCanSpeak) { const l = () => setVoices(speechSynthesis.getVoices()); l(); speechSynthesis.addEventListener('voiceschanged', l); return () => speechSynthesis.removeEventListener('voiceschanged', l); }
  }, []);
  const saveV = (patch: Partial<VoiceSettings>) => { const n = { ...v, ...patch }; setV(n); saveVoiceSettings(n); };
  const save = async (patch: Partial<Settings>) => { try { setS(await nx.saveSettings(patch)); } catch (e) { setError((e as Error).message); } };
  const test = () => { const e = getEngine(); e.stopSpeaking(); e.say("Good evening. JARVIS online, and as modest as ever."); };
  return (
    <>
      <PageTitle eyebrow="Settings" title="Tune JARVIS" sub="Everything is stored on your computer." />
      <ErrorText error={error} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Voice">
          <div className="grid gap-3">
            <Field label="Speaking voice"><Select value={v.tts} onChange={e => saveV({ tts: e.target.value as VoiceSettings['tts'] })}>
              <option value="auto">Automatic (best available)</option><option value="server" disabled={caps?.serverTts === false}>OpenJarvis voices (Kokoro, macOS Daniel…){caps?.serverTts === false ? ' · not installed' : ''}</option><option value="browser" disabled={!browserCanSpeak}>Browser / system voices</option></Select></Field>
            {v.tts !== 'server' && browserCanSpeak && <Field label="System voice"><Select value={v.browserVoice} onChange={e => saveV({ browserVoice: e.target.value })}><option value="">Automatic (British male first)</option>{voices.map(x => <option key={x.name} value={x.name}>{x.name} ({x.lang})</option>)}</Select></Field>}
            <div className="grid grid-cols-2 gap-3"><Field label={`Speed ${v.rate.toFixed(2)}×`}><input type="range" min={0.7} max={1.5} step={0.05} value={v.rate} onChange={e => saveV({ rate: +e.target.value })} /></Field>
              <Field label={`Volume ${Math.round(v.volume * 100)}%`}><input type="range" min={0} max={1} step={0.05} value={v.volume} onChange={e => saveV({ volume: +e.target.value })} /></Field></div>
            <Field label="Language I speak (for browser speech recognition)"><Select value={v.lang} onChange={e => saveV({ lang: e.target.value })}>{[['en-GB', 'English (UK)'], ['en-US', 'English (US)'], ['en-NG', 'English (Nigeria) / Pidgin'], ['fr-FR', 'Français'], ['ar-SA', 'العربية'], ['ha-NG', 'Hausa'], ['es-ES', 'Español'], ['zh-CN', '中文'], ['ja-JP', '日本語'], ['de-DE', 'Deutsch'], ['pt-PT', 'Português'], ['it-IT', 'Italiano'], ['ru-RU', 'Русский']].map(([c, l]) => <option key={c} value={c}>{l}</option>)}</Select></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.wake} onChange={e => saveV({ wake: e.target.checked })} /> Wake word: only answer after “Hey {v.wakeWord}” during a voice session</label>
            {v.wake && <Field label="Wake word"><Input value={v.wakeWord} onChange={e => saveV({ wakeWord: e.target.value.toLowerCase().trim() || 'jarvis' })} /></Field>}
            <div className="flex items-center gap-2"><Btn onClick={test}>Test voice</Btn></div>
            <p className="nx-dim m-0 text-xs">Listening uses {browserCanListen ? 'your browser\'s speech recognition (fast; one language at a time)' : caps?.serverStt ? 'the OpenJarvis speech server (detects your language automatically)' : 'nothing yet: use Chrome/Safari, or install OpenJarvis speech (uv sync --extra speech)'}.</p>
          </div>
        </Card>
        <Card title="Personality & schedule">
          {s && (
            <div className="grid gap-3">
              <Field label={`Sarcasm and humor: ${['off', 'light', 'normal', 'maximum'][s.humor]}`}><input type="range" min={0} max={3} step={1} value={s.humor} onChange={e => void save({ humor: +e.target.value })} /></Field>
              <Field label="Time zone"><Input value={s.timezone || ''} placeholder={Intl.DateTimeFormat().resolvedOptions().timeZone} onChange={e => setS({ ...s, timezone: e.target.value })} onBlur={e => e.target.value && void save({ timezone: e.target.value })} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.desktop_notifications} onChange={e => void save({ desktop_notifications: e.target.checked })} /> Desktop notifications for reminders and alerts</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.briefing_enabled} onChange={e => void save({ briefing_enabled: e.target.checked })} /> Morning briefing at <input className="nx-input" style={{ width: 'auto' }} type="time" value={s.briefing_time} onChange={e => void save({ briefing_time: e.target.value })} /></label>
            </div>
          )}
        </Card>
        <Card title="Audit log" className="lg:col-span-2">
          <p className="nx-dim mt-0 text-xs">Every action JARVIS or you took on your data: reminders, memories, drafts, website reads, deletions.</p>
          {!audit.length ? <Empty>Nothing yet.</Empty> : <ul className="nx-scroll m-0 grid max-h-72 list-none gap-1 overflow-y-auto p-0 text-xs">{audit.map(a => <li key={a.id} className="nx-mono"><span className="nx-dim">{new Date(a.at * 1000).toLocaleString()}</span> · <span style={{ color: a.actor === 'jarvis' ? 'var(--cyan)' : 'var(--ink)' }}>{a.actor}</span> · {a.action} <span className="nx-dim">{a.detail.slice(0, 120)}</span></li>)}</ul>}
        </Card>
      </div>
    </>
  );
}
