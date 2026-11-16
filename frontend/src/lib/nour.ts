/**
 * Nour: a sarcastic butler persona with task modes and a small on-device memory.
 *
 * The OpenJarvis chat API has no per-request system prompt for this page, so the
 * persona, the active mode and the remembered facts are prepended to the latest
 * user turn. Facts are learned from `[[remember: ...]]` tags the model appends
 * to its reply; the tags are stripped before display and speech.
 */

export type NourMode = 'chat' | 'drague' | 'langue' | 'etude' | 'traduction';

export const NOUR_LANGUAGES = [
  'English', 'French', 'Arabic', 'Spanish', 'German', 'Italian',
  'Portuguese', 'Turkish', 'Chinese', 'Japanese', 'Korean',
] as const;

export const PERSONA =
  "You are Nour, the user's personal AI assistant in the Nx Ai app: a polished British AI butler, " +
  'capable, calm and drily sarcastic. Tease with deadpan wit, then always give the correct, useful answer. ' +
  "The sarcasm is affectionate, never cruel. Call the user 'sir' or 'boss' now and then. " +
  'Reply in the language the user writes in (French, English, Arabic...) unless the mode says otherwise. ' +
  'Plain text, no markdown headers. Be brief: under 80 words unless asked for more.';

export const MEMORY_RULE =
  'MEMORY: When the user shares a lasting fact about themselves worth remembering (name, goals, ' +
  'languages and level, school subjects and exams, preferences, people they mention), end your reply ' +
  'with one extra line exactly like [[remember: short fact in third person]]. Use it only for genuinely ' +
  'new facts, never for passwords, bank or health details. If they ask you to forget something, add ' +
  '[[forget: keyword]]. Never mention these tags.';

interface ModeDef {
  label: string;
  needsLanguage: boolean;
  hint: (lang: string) => string;
  prompt: (lang: string) => string;
  examples: (lang: string) => string[];
  defaultAsk: string;
}

export const MODES: Record<NourMode, ModeDef> = {
  chat: {
    label: 'Chat',
    needsLanguage: false,
    hint: () => 'Ask Nour anything…',
    prompt: () => '',
    examples: () => ['Plan my day in 5 steps', 'Nour, what do you think of me?', 'Give me a motivating quote'],
    defaultAsk: 'What can you tell me about this?',
  },
  drague: {
    label: 'Drague',
    needsLanguage: false,
    hint: () => 'Paste their message, or ask for an opener…',
    prompt: () =>
      'MODE: dating and flirting coach. Help the user flirt with charm and confidence: openers, witty ' +
      'replies, date ideas, reading signals, confidence. Stay respectful, honest and consent-minded, never ' +
      'manipulative. When they paste a message they received, give 2-3 reply options in different tones ' +
      '(playful, sweet, bold).',
    examples: () => [
      'Give me an opener for someone who loves books',
      'They replied “haha ok”. What do I send?',
      'Plan a cheap but memorable first date',
      "Donne-moi une phrase d'accroche drôle",
    ],
    defaultAsk: 'Help me reply to this.',
  },
  langue: {
    label: 'Langue',
    needsLanguage: true,
    hint: (lang) => `Write in ${lang}, I'll correct you…`,
    prompt: (lang) =>
      `MODE: ${lang} tutor. Help the user learn ${lang}. If they write in ${lang}, correct mistakes: give ` +
      'the corrected sentence and a one-line explanation. Add pronunciation tips when useful. Adapt to ' +
      `their level. End with one short question in ${lang} to keep practising.`,
    examples: (lang) => [
      `Teach me 5 useful ${lang} phrases for a café`,
      `Let's have a short conversation in ${lang}`,
      'Correct me: I goed to the market yesterday',
    ],
    defaultAsk: 'Correct this and explain my mistakes.',
  },
  etude: {
    label: 'Étude',
    needsLanguage: false,
    hint: () => 'Ask about a subject, or attach your lesson…',
    prompt: () =>
      'MODE: study coach. Explain concepts simply, step by step, with an example. Make summaries, ' +
      'flashcards and quick quizzes on request, and help plan revision. For homework, help them ' +
      'understand first; give the final answer directly if they ask for it.',
    examples: () => [
      'Explain photosynthesis simply',
      'Make me 5 flashcards on World War II',
      'Build me a 2-week revision plan',
    ],
    defaultAsk: 'Explain this to me.',
  },
  traduction: {
    label: 'Traduction',
    needsLanguage: true,
    hint: (lang) => `Text to translate into ${lang}…`,
    prompt: (lang) =>
      `MODE: translator. Translate the user's text into ${lang}, naturally and faithfully. Give the ` +
      'translation first, with no sarcasm inside it. Then at most one short line on a nuance, slang or ' +
      `alternative if useful. If the text is already in ${lang}, translate it into French instead.`,
    examples: () => ['Je suis en retard, désolé', 'Comment on dit « tu me manques » ?', 'On se voit ce soir ?'],
    defaultAsk: 'Translate this.',
  },
};

export interface NourFact {
  t: string;
  at: number;
}

export interface NourTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AttachedText {
  name: string;
  text: string;
}

/** Build the message list sent to `/v1/chat/completions`. */
export function buildMessages(
  history: NourTurn[],
  text: string,
  opts: { mode: NourMode; lang: string; facts: NourFact[]; files?: AttachedText[]; maxTurns?: number },
): NourTurn[] {
  const turns = history.slice(-(opts.maxTurns ?? 8)).map((m) => ({ ...m }));
  while (turns.length && turns[0].role !== 'user') turns.shift();
  const modeLine = MODES[opts.mode].prompt(opts.lang);
  const known = opts.facts.length
    ? '\nWhat you know about the user:\n- ' + opts.facts.map((f) => f.t).join('\n- ')
    : '';
  const fileText = (opts.files ?? []).map((f) => `\n\n[File: ${f.name}]\n${f.text}`).join('');
  const content =
    PERSONA + (modeLine ? '\n' + modeLine : '') + '\n' + MEMORY_RULE + known + '\n\nUser: ' + text + fileText;
  turns.push({ role: 'user', content });
  return turns;
}

const TAG = /\[\[(remember|forget):\s*([^\]]+?)\s*\]\]/gi;

/** Reply text without memory tags, including a tag still being streamed. */
export function visibleText(text: string): string {
  return text.replace(/\[\[[\s\S]*?(\]\]|$)/g, '').replace(/\[$/, '').trim();
}

export interface MemoryOps {
  remember: string[];
  forget: string[];
}

export function memoryOps(reply: string): MemoryOps {
  const ops: MemoryOps = { remember: [], forget: [] };
  for (const [, kind, value] of reply.matchAll(TAG)) {
    (kind.toLowerCase() === 'remember' ? ops.remember : ops.forget).push(value);
  }
  return ops;
}

/** Apply learned facts; returns the new list and human-readable notes. */
export function applyMemory(
  facts: NourFact[],
  ops: MemoryOps,
  now = Date.now(),
): { facts: NourFact[]; notes: string[] } {
  let next = [...facts];
  const notes: string[] = [];
  for (const raw of ops.remember) {
    const t = raw.trim().replace(/\s+/g, ' ').slice(0, 200);
    if (t && !next.some((f) => f.t.toLowerCase() === t.toLowerCase())) {
      next.push({ t, at: now });
      notes.push(`Noted: ${t}`);
    }
  }
  for (const raw of ops.forget) {
    const w = raw.trim().toLowerCase();
    if (!w) continue;
    const before = next.length;
    next = next.filter((f) => !f.t.toLowerCase().includes(w));
    if (next.length < before) notes.push(`Forgotten: ${raw.trim()}`);
  }
  return { facts: next.slice(-60), notes };
}

const WAKE = /^\s*(hey\s+|ok\s+|dis\s+)?(nour|noor|nur)\b[\s,.!?:;-]*/i;

/** Drop a leading "Nour," from dictated text. */
export function stripWakeWord(text: string): string {
  return text.replace(WAKE, '').trim();
}
