/**
 * Nour's voice (see config/voice-identity.json): young masculine (16-20), medium pitch, warm,
 * clear, relaxed and confident, and the same speaker in English and French whenever the system has
 * a multilingual neural voice (Microsoft Edge: Brian / Andrew Multilingual).
 *
 * Free and offline-capable: it uses the voices built into the browser / OS (no audio API).
 *
 *   const v = new NourVoice();
 *   v.speak("Salut ! Hey, it's Nour.", { onStart, onWord, onEnd });
 */

const NV_MULTI = [/Brian\s*Multilingual/i, /Andrew\s*Multilingual/i, /Remy\s*Multilingual/i];
const NV_EN = [
  /Microsoft (Brian|Andrew|Christopher|Eric|Steffan|Roger).*Online.*English \((United States|Canada)\)/i,
  /Evan.*\((Premium|Enhanced)\)/i, /Nathan.*\((Premium|Enhanced)\)/i, /Tom.*\((Premium|Enhanced)\)/i, /Aaron/i,
  /^Evan\b/i, /^Nathan\b/i, /^Tom\b/i, /^Alex\b/i, /Microsoft (Guy|Davis|Jason|Tony)/i, /Google US English Male/i,
];
const NV_FR = [
  /Microsoft (Henri|Alain|Claude|Jerome|Yves|Antoine|Jean).*Online.*French/i,
  /Thomas.*\((Premium|Enhanced)\)/i, /Nicolas.*\((Premium|Enhanced)\)/i, /^Thomas\b/i, /^Nicolas\b/i, /Microsoft (Paul|Claude)/i,
];
const NV_FEMALE = /female|serena|kate|stephanie|martha|libby|sonia|maisie|hazel|susan|fiona|moira|karen|tessa|samantha|victoria|allison|ava\b|emma|jenny|aria|zoe|amelie|amélie|audrey|aurelie|marie|denise|vivienne|eloise|brigitte|celeste|coralie|jacqueline|josephine|yvette|sylvie|julie|chantal|google fran/i;
const NV_AVOID = /daniel|arthur|fred|ralph|bruce|junior|albert|grandpa|bad news|bahh|bells|boing|bubbles|cellos|whisper|zarvox|trinoids|organ|wobble|jester|superstar|good news|deranged|hysterical|pipe/i;

export type NourLang = "en" | "fr";
export interface SpeakHooks { onStart?: () => void; onWord?: () => void; onEnd?: () => void }

function nvRank(vs: SpeechSynthesisVoice[], rank: RegExp[], langRe: RegExp | null): SpeechSynthesisVoice[] {
  const out: SpeechSynthesisVoice[] = [];
  for (const re of rank) for (const v of vs) if (re.test(v.name) && !NV_FEMALE.test(v.name) && !out.includes(v)) out.push(v);
  if (langRe) for (const v of vs) if (langRe.test(v.lang) && !NV_FEMALE.test(v.name) && !NV_AVOID.test(v.name) && !out.includes(v)) out.push(v);
  return out;
}

/** English or French? (enough to pick the right pronunciation for each phrase) */
export function detectLang(t: string): NourLang {
  const x = " " + t.toLowerCase() + " ";
  let fr = (x.match(/[éèêëàâùûçôîïœ]/g) || []).length * 2;
  fr += (x.match(/\s(je|tu|il|elle|nous|vous|le|la|les|des|du|un|une|est|et|pas|que|qui|pour|avec|dans|sur|mais|oui|non|merci|bonjour|salut|c'est|j'ai|ça|très|bien|on|ton|ta|tes|mon|ma|mes)\s/g) || []).length;
  const en = (x.match(/\s(the|and|you|is|are|it|to|of|in|that|this|with|for|not|i'm|what|your|my|have|do|can|yes|no|hey|thanks)\s/g) || []).length;
  return fr > en ? "fr" : "en";
}

/** Clean text for speech and split it into short phrases (long utterances get cut off in Chrome). */
export function phrases(text: string): string[] {
  const t = String(text)
    .replace(/https?:\/\/\S+/g, "the link")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/[*_#`>|~]/g, "").replace(/\s+[—–]\s+/g, ", ")
    .replace(/\s+/g, " ").replace(/\s+([.,!?;:])/g, "$1").trim();
  if (!t) return [];
  const out: string[] = [];
  for (const sent of t.match(/[^.!?…]+[.!?…]*\s*/g) || [t]) {
    let s = sent.trim();
    while (s.length > 180) { let k = s.lastIndexOf(", ", 180); if (k < 60) k = s.lastIndexOf(" ", 180); if (k < 1) k = 180; out.push(s.slice(0, k + 1).trim()); s = s.slice(k + 1).trim(); }
    if (s) out.push(s);
  }
  return out;
}

export class NourVoice {
  pitch = 1;      // medium (clamped 0.85-1.15: never deep, never squeaky)
  rate = 1.02;    // relaxed but confident
  preferred = ""; // a voice name chosen by the user, or "" for automatic
  private token = 0;

  get supported() { return typeof window !== "undefined" && "speechSynthesis" in window; }

  /** The voices Nour would use right now. `multi` = one speaker for both languages. */
  voices() {
    const vs = this.supported ? speechSynthesis.getVoices() : [];
    const chosen = vs.find(v => v.name === this.preferred) || null;
    if (chosen) return { multi: /Multilingual/i.test(chosen.name) ? chosen : null, en: /^en/i.test(chosen.lang) ? chosen : null, fr: /^fr/i.test(chosen.lang) ? chosen : null };
    return {
      multi: nvRank(vs, NV_MULTI, null)[0] || null,
      en: nvRank(vs, NV_EN, /^en[-_](US|CA|AU|IE|NZ|ZA)/i)[0] || nvRank(vs, [], /^en/i)[0] || null,
      fr: nvRank(vs, NV_FR, /^fr/i)[0] || null,
    };
  }

  /** Waits until the browser has loaded its voice list (it loads asynchronously). */
  ready(): Promise<void> {
    if (!this.supported || speechSynthesis.getVoices().length) return Promise.resolve();
    return new Promise(res => { const done = () => res(); speechSynthesis.addEventListener("voiceschanged", done, { once: true }); setTimeout(done, 1500); });
  }

  stop() { this.token++; if (this.supported) speechSynthesis.cancel(); }

  async speak(text: string, hooks: SpeakHooks = {}): Promise<void> {
    if (!this.supported) { hooks.onEnd?.(); return; }
    await this.ready();
    this.stop();
    const my = ++this.token, set = this.voices(), parts = phrases(text);
    hooks.onStart?.();
    for (const part of parts) {
      if (my !== this.token) return;
      await new Promise<void>(res => {
        const u = new SpeechSynthesisUtterance(part);
        const lang = detectLang(part);
        const v = set.multi || (lang === "fr" ? set.fr || set.en : set.en || set.fr);
        try { if (v) u.voice = v; } catch { /* voice not settable in this browser */ }
        u.lang = set.multi || !v ? (lang === "fr" ? "fr-FR" : "en-US") : v.lang;
        u.pitch = Math.max(0.85, Math.min(1.15, this.pitch));
        u.rate = this.rate;
        u.onboundary = () => hooks.onWord?.();
        let settled = false; const end = () => { if (!settled) { settled = true; res(); } };
        u.onend = u.onerror = end;
        speechSynthesis.speak(u);
        setTimeout(end, 2500 + part.length * 120); // never hang if the browser drops an utterance
      });
    }
    if (my === this.token) hooks.onEnd?.();
  }
}
