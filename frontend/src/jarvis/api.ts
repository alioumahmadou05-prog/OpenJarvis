import { apiFetch } from '../lib/api';

/** Typed client for the Nour AI backend (/v1/nxxr). */

export interface Conversation { id: string; title: string; mode: string; archived: number; created_at: number; updated_at: number }
export interface Source { title: string; url: string; snippet?: string; date?: string }
export interface Action { type: 'remind' | 'remember' | 'forget'; ok: boolean; text?: string; due_at?: number; recurrence?: string; keyword?: string; removed?: number; error?: string; duplicate?: boolean }
export interface Message { id: string; role: 'user' | 'assistant'; content: string; source: 'text' | 'voice'; meta: { sources?: Source[]; actions?: Action[] }; created_at: number }
export interface Memory { id: string; text: string; category: string; source: string; created_at: number; updated_at: number }
export interface Reminder { id: string; text: string; due_at: number; recurrence: string; status: string; source: string; fired_at: number | null }
export interface Notice { id: string; kind: string; title: string; body: string; link: string; read: number; created_at: number }
export interface Site {
  id: string; name: string; url: string; health_path: string; auth_method: string; auth_header: string;
  perm_read: number; perm_prepare: number; perm_execute: number; monitor_minutes: number; bridge_key: string;
  status: string; status_code: number | null; latency_ms: number | null; page_title: string; last_error: string;
  last_check: number | null; last_event: number | null; has_token: boolean; connection: string;
}
export interface SiteEvent { id: string; level: string; kind: string; message: string; page: string; created_at: number }
export interface Job { id: string; kind: string; input: string; status: string; progress: string; report_id: string | null; error: string; created_at: number; finished_at: number | null }
export interface Report { id: string; title: string; body: string; sources: Source[]; kind: string; created_at: number }
export interface Status { server_time: number; internet: boolean | null; model: string; scheduler: boolean; counts: Record<string, number>; modes: Record<string, string> }
export interface Settings { timezone: string | null; humor: number; desktop_notifications: boolean; briefing_enabled: boolean; briefing_time: string; briefing_topics: string[]; wake_word: string }
export interface Context { system: string; sources: Source[]; used_web: boolean; web_ok: boolean; history: { role: string; content: string }[]; searched_at?: number }
export interface Collected { connected: string[]; not_connected: string[]; errors: string[]; items: { source: string; title: string; author: string; time: number | null; url: string; snippet: string }[] }

export const MODE_LIST: [string, string][] = [
  ['companion', 'Sarcastic companion'], ['normal', 'Normal'], ['tutor', 'Academic tutor'], ['research', 'Research'],
  ['social', 'Social & dating'], ['professional', 'Professional'], ['news', 'News briefing'],
];

export const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(`/v1/nxxr${path}`, {
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) },
  });
  if (!res.ok) {
    let detail = `${res.status}`;
    try { const j = await res.json(); detail = typeof j.detail === 'string' ? j.detail : detail; } catch { /* not JSON */ }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}
const body = (b: unknown) => ({ body: JSON.stringify(b) });

export const nx = {
  status: () => call<Status>('/status'),
  settings: () => call<Settings>('/settings'),
  saveSettings: (s: Partial<Settings>) => call<Settings>('/settings', { method: 'PUT', ...body(s) }),
  context: (r: { message: string; mode: string; conversation_id?: string | null; web?: 'auto' | 'on' | 'off'; humor?: number }) =>
    call<Context>('/context', { method: 'POST', ...body({ ...r, tz: TZ }) }),

  conversations: (q = '', archived = false) => call<{ conversations: Conversation[] }>(`/conversations?q=${encodeURIComponent(q)}&archived=${archived}`),
  createConversation: (mode = 'companion') => call<Conversation>('/conversations', { method: 'POST', ...body({ mode }) }),
  conversation: (id: string) => call<Conversation & { messages: Message[] }>(`/conversations/${id}`),
  patchConversation: (id: string, p: Partial<{ title: string; mode: string; archived: boolean }>) => call<Conversation>(`/conversations/${id}`, { method: 'PATCH', ...body(p) }),
  deleteConversation: (id: string) => call<{ deleted: boolean }>(`/conversations/${id}`, { method: 'DELETE' }),
  addMessage: (id: string, m: { role: 'user' | 'assistant'; content: string; source?: 'text' | 'voice'; sources?: Source[] }) =>
    call<{ message: Message; actions: Action[]; conversation: Conversation }>(`/conversations/${id}/messages`, { method: 'POST', ...body({ ...m, tz: TZ }) }),
  search: (q: string) => call<{ results: (Message & { title: string; conversation_id: string })[] }>(`/search?q=${encodeURIComponent(q)}`),

  memories: (q = '') => call<{ memories: Memory[] }>(`/memories?q=${encodeURIComponent(q)}`),
  addMemory: (text: string, category = 'general') => call<Memory>('/memories', { method: 'POST', ...body({ text, category }) }),
  editMemory: (id: string, p: { text?: string; category?: string }) => call<Memory>(`/memories/${id}`, { method: 'PATCH', ...body(p) }),
  deleteMemory: (id: string) => call<{ deleted: boolean }>(`/memories/${id}`, { method: 'DELETE' }),
  clearMemories: () => call<{ deleted: number }>('/memories?confirm=yes', { method: 'DELETE' }),

  reminders: (status = '') => call<{ reminders: Reminder[] }>(`/reminders?status=${status}`),
  addReminder: (text: string, due: string, recurrence = 'none') => call<Reminder>('/reminders', { method: 'POST', ...body({ text, due, recurrence, tz: TZ }) }),
  patchReminder: (id: string, p: Partial<{ text: string; due: string; recurrence: string; status: string }>) => call<Reminder>(`/reminders/${id}`, { method: 'PATCH', ...body({ ...p, tz: TZ }) }),
  deleteReminder: (id: string) => call<{ deleted: boolean }>(`/reminders/${id}`, { method: 'DELETE' }),

  notifications: (unread = false) => call<{ notifications: Notice[] }>(`/notifications?unread=${unread}`),
  readNotice: (id: string) => call(`/notifications/${id}/read`, { method: 'POST' }),
  readAll: () => call('/notifications/read-all', { method: 'POST' }),

  email: (hours = 48) => call<Collected>(`/email?hours=${hours}`),
  calendar: (hours = 24) => call<Collected>(`/calendar?hours=${hours}`),
  draftEmail: (r: { to: string; about: string; context: string; style: string }) => call<{ subject: string; body: string; to: string; note: string }>('/email/draft', { method: 'POST', ...body({ ...r, tz: TZ }) }),

  sites: () => call<{ sites: Site[] }>('/sites'),
  addSite: (s: Record<string, unknown>) => call<Site>('/sites', { method: 'POST', ...body(s) }),
  patchSite: (id: string, s: Record<string, unknown>) => call<Site>(`/sites/${id}`, { method: 'PATCH', ...body(s) }),
  deleteSite: (id: string) => call<{ deleted: boolean }>(`/sites/${id}`, { method: 'DELETE' }),
  checkSite: (id: string) => call<Site>(`/sites/${id}/check`, { method: 'POST' }),
  snapshot: (id: string) => call<{ title: string; description: string; headings: string[]; internal_links: string[]; external_links: string[]; forms: number; issues: string[]; text_excerpt: string; status_code: number }>(`/sites/${id}/snapshot`),
  siteEvents: (id: string) => call<{ events: SiteEvent[] }>(`/sites/${id}/events`),

  jobs: () => call<{ jobs: Job[] }>('/jobs'),
  startJob: (kind: string, input = '') => call<Job>('/jobs', { method: 'POST', ...body({ kind, input }) }),
  cancelJob: (id: string) => call(`/jobs/${id}/cancel`, { method: 'POST' }),
  reports: () => call<{ reports: Report[] }>('/reports'),
  report: (id: string) => call<Report>(`/reports/${id}`),
  deleteReport: (id: string) => call(`/reports/${id}`, { method: 'DELETE' }),

  audit: () => call<{ audit: { id: number; at: number; actor: string; action: string; detail: string }[] }>('/audit'),
  exportUrl: '/v1/nxxr/export',
};

/** Text that is safe to show or speak while a reply is still streaming (hides action tags). */
export function visible(text: string): string {
  return text.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').replace(/\[\[[\s\S]*?(\]\]|$)/g, '').replace(/\[$/, '').trim();
}

/** Group conversations the way chat apps do. */
export function groupByDate<T extends { updated_at: number }>(items: T[], now = Date.now()): { label: string; items: T[] }[] {
  const day = 86400000;
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const t0 = start.getTime();
  const buckets: [string, (t: number) => boolean][] = [
    ['Today', t => t >= t0],
    ['Yesterday', t => t >= t0 - day && t < t0],
    ['Previous 7 days', t => t >= t0 - 7 * day && t < t0 - day],
    ['Previous 30 days', t => t >= t0 - 30 * day && t < t0 - 7 * day],
    ['Older', t => t < t0 - 30 * day],
  ];
  return buckets.map(([label, test]) => ({ label, items: items.filter(i => test(i.updated_at * 1000)) })).filter(g => g.items.length);
}

export function when(ts: number | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  const today = new Date(); const sameDay = d.toDateString() === today.toDateString();
  const tomorrow = new Date(Date.now() + 86400000).toDateString() === d.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `Today ${time}`;
  if (tomorrow) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`;
}

export function ago(ts: number | null | undefined): string {
  if (!ts) return 'never';
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
