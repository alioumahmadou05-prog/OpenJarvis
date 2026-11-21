import { synthesizeSpeech, transcribeAudio, fetchTtsHealth, fetchSpeechHealth } from '../lib/api';

/**
 * Voice engine for JARVIS.
 * - Ears: the browser's speech recognition when it exists (Chrome, Edge, Safari), otherwise the
 *   OpenJarvis speech-to-text server with a simple energy-based voice-activity detector.
 * - Mouth: OpenJarvis text-to-speech (Kokoro, macOS Daniel, cloud voices) when available,
 *   otherwise the browser's own voices. Sentences are queued so speech starts before the reply ends.
 * - Barge-in: speaking over JARVIS stops it.
 */

export type VoiceState = 'off' | 'listening' | 'hearing' | 'thinking' | 'speaking';
export interface VoiceSettings { tts: 'auto' | 'server' | 'browser'; browserVoice: string; rate: number; volume: number; lang: string; wake: boolean; wakeWord: string }

const SR: any = (typeof window !== 'undefined') && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
export const browserCanListen = !!SR;
export const browserCanSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

export const DEFAULT_VOICE: VoiceSettings = { tts: 'auto', browserVoice: '', rate: 1, volume: 1, lang: navigator.language || 'en-GB', wake: false, wakeWord: 'jarvis' };

function similar(a: string, b: string): number {
  const A = new Set(a.toLowerCase().split(/\W+/).filter(Boolean)), B = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  if (!A.size || !B.size) return 0;
  let n = 0; A.forEach(w => { if (B.has(w)) n++; });
  return n / Math.min(A.size, B.size);
}

export class VoiceEngine {
  settings: VoiceSettings;
  state: VoiceState = 'off';
  onState: (s: VoiceState) => void = () => {};
  onInterim: (t: string) => void = () => {};
  onTurn: (t: string) => void = () => {};
  onError: (msg: string) => void = () => {};
  private active = false;
  private rec: any = null;
  private buffer = '';
  private silenceT: number | undefined;
  private queue: string[] = [];
  private playing = false;
  private audio: HTMLAudioElement | null = null;
  private speakingText = '';
  private serverTts: boolean | null = null;
  private serverStt: boolean | null = null;
  private stream: MediaStream | null = null;
  private vadStop: (() => void) | null = null;
  private awake = false;

  constructor(settings: VoiceSettings) { this.settings = settings; }

  private set(s: VoiceState) { this.state = s; this.onState(s); }
  get speaking() { return this.playing || this.queue.length > 0; }

  async capabilities() {
    if (this.serverTts === null) this.serverTts = await fetchTtsHealth().then(h => !!h.available).catch(() => false);
    if (this.serverStt === null) this.serverStt = await fetchSpeechHealth().then(h => !!h.available).catch(() => false);
    return { serverTts: this.serverTts, serverStt: this.serverStt, browserListen: browserCanListen, browserSpeak: browserCanSpeak };
  }

  // ------------------------------------------------------------- speaking
  say(text: string) {
    const clean = text.replace(/[*_#`>|]/g, '').replace(/\[\d+\]/g, '').trim();
    if (!clean) return;
    this.queue.push(clean);
    if (!this.playing) void this.pump();
  }

  stopSpeaking() {
    this.queue = [];
    this.playing = false;
    this.speakingText = '';
    try { this.audio?.pause(); } catch { /* ignore */ }
    this.audio = null;
    try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
    if (this.state === 'speaking') this.set(this.active ? 'listening' : 'off');
  }

  private async pump() {
    this.playing = true;
    while (this.queue.length) {
      const text = this.queue.shift()!;
      this.speakingText = text;
      this.set('speaking');
      const useServer = this.settings.tts === 'server' || (this.settings.tts === 'auto' && (await this.capabilities()).serverTts);
      try {
        if (useServer) await this.playServer(text); else await this.playBrowser(text);
      } catch {
        try { await this.playBrowser(text); } catch { /* give up on this sentence */ }
      }
      if (!this.playing) return;
    }
    this.playing = false;
    this.speakingText = '';
    this.set(this.active ? 'listening' : 'off');
  }

  private async playServer(text: string) {
    const blob = await synthesizeSpeech(text, { speed: this.settings.rate });
    if (!this.playing) return;
    const url = URL.createObjectURL(blob);
    await new Promise<void>((resolve) => {
      const a = new Audio(url); this.audio = a; a.volume = this.settings.volume;
      a.onended = a.onerror = () => { URL.revokeObjectURL(url); resolve(); };
      a.play().catch(() => resolve());
    });
  }

  private playBrowser(text: string) {
    return new Promise<void>((resolve, reject) => {
      if (!browserCanSpeak) return reject(new Error('no speech'));
      const u = new SpeechSynthesisUtterance(text);
      const voices = speechSynthesis.getVoices();
      const v = voices.find(x => x.name === this.settings.browserVoice) || voices.find(x => /Daniel|Google UK English Male|Arthur/.test(x.name)) || null;
      if (v) { u.voice = v; u.lang = v.lang; }
      u.rate = this.settings.rate; u.volume = this.settings.volume;
      u.onend = () => resolve(); u.onerror = () => resolve();
      speechSynthesis.speak(u);
    });
  }

  // ------------------------------------------------------------ listening
  async start() {
    if (this.active) return;
    this.active = true; this.awake = !this.settings.wake;
    this.set('listening');
    if (browserCanListen) this.startBrowser();
    else if ((await this.capabilities()).serverStt) await this.startServer();
    else { this.active = false; this.set('off'); this.onError('Voice input needs Chrome/Safari speech recognition or the OpenJarvis speech server (uv sync --extra speech).'); }
  }

  stop() {
    this.active = false;
    clearTimeout(this.silenceT);
    try { this.rec?.abort(); } catch { /* ignore */ }
    this.rec = null;
    this.vadStop?.(); this.vadStop = null;
    this.stream?.getTracks().forEach(t => t.stop()); this.stream = null;
    this.stopSpeaking();
    this.set('off');
  }

  setThinking() { if (this.active) this.set('thinking'); }
  get isActive() { return this.active; }

  private deliver(text: string) {
    const t = text.trim();
    if (!t) return;
    if (this.settings.wake && !this.awake) {
      const re = new RegExp(`\\b(hey\\s+|ok\\s+|dis\\s+)?${this.settings.wakeWord}\\b[\\s,.!?]*`, 'i');
      const m = t.match(re);
      if (!m) return;
      this.awake = true;
      const rest = t.slice((m.index || 0) + m[0].length).trim();
      if (!rest) { this.say('Yes?'); return; }
      this.onTurn(rest);
      return;
    }
    this.onTurn(t);
  }

  private startBrowser() {
    const r = new SR();
    r.lang = this.settings.lang; r.continuous = true; r.interimResults = true;
    this.rec = r;
    r.onresult = (e: any) => {
      let interim = '', fin = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const tx = e.results[i][0].transcript;
        if (e.results[i].isFinal) fin += tx + ' '; else interim += tx;
      }
      // Barge-in, ignoring JARVIS's own voice leaking into the microphone.
      if (this.speaking && interim.trim().length > 6 && similar(interim, this.speakingText) < 0.5) this.stopSpeaking();
      if (this.speaking && similar(fin + interim, this.speakingText) > 0.5) return;
      if (fin) this.buffer += fin;
      const heard = (this.buffer + interim).trim();
      if (heard) { this.onInterim(heard); if (!this.speaking) this.set('hearing'); }
      clearTimeout(this.silenceT);
      this.silenceT = window.setTimeout(() => { const t = this.buffer; this.buffer = ''; this.onInterim(''); this.deliver(t); }, 1000);
    };
    r.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.onError('Microphone access is blocked. Allow it and try again.'); this.stop(); }
    };
    r.onend = () => { if (this.active && this.rec === r) setTimeout(() => this.active && this.startBrowser(), 150); };
    try { r.start(); } catch { /* already started */ }
  }

  private async startServer() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch { this.onError('Microphone access is blocked.'); this.stop(); return; }
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(this.stream);
    const an = ctx.createAnalyser(); an.fftSize = 1024; src.connect(an);
    const data = new Float32Array(an.fftSize);
    let recorder: MediaRecorder | null = null, chunks: Blob[] = [], voicedSince = 0, quietSince = 0, raf = 0, noise = 0.01;
    const loop = () => {
      an.getFloatTimeDomainData(data);
      let sum = 0; for (const v of data) sum += v * v;
      const rms = Math.sqrt(sum / data.length), now = performance.now();
      if (!recorder) noise = noise * 0.98 + rms * 0.02;
      const thr = Math.max(0.015, noise * 3) * (this.speaking ? 2.2 : 1);
      if (rms > thr) {
        quietSince = 0;
        if (!voicedSince) voicedSince = now;
        if (this.speaking && now - voicedSince > 300) this.stopSpeaking();
        if (!recorder && now - voicedSince > 150) {
          chunks = []; recorder = new MediaRecorder(this.stream!);
          recorder.ondataavailable = ev => ev.data.size && chunks.push(ev.data);
          recorder.onstop = async () => {
            const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
            if (blob.size < 3000) return;
            this.set('thinking');
            try { const r = await transcribeAudio(blob); this.deliver(r.text || ''); } catch (err) { this.onError('Transcription failed: ' + (err as Error).message); this.set('listening'); }
          };
          recorder.start(); this.set('hearing');
        }
      } else {
        voicedSince = 0;
        if (recorder && !quietSince) quietSince = now;
        if (recorder && quietSince && now - quietSince > 900) { recorder.stop(); recorder = null; quietSince = 0; }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    this.vadStop = () => { cancelAnimationFrame(raf); try { recorder?.stop(); } catch { /* ignore */ } ctx.close(); };
  }
}

/** Split streamed text into speakable sentences; returns [ready sentences, remainder]. */
export function takeSentences(buffer: string, final = false): [string[], string] {
  const out: string[] = [];
  let rest = buffer;
  const re = /^([\s\S]*?[.!?…。？！:\n])(?=\s|$)/;
  let m: RegExpMatchArray | null;
  while ((m = rest.match(re))) {
    const s = m[1].trim();
    if (s.length > 2) out.push(s);
    rest = rest.slice(m[0].length);
  }
  if (final && rest.trim()) { out.push(rest.trim()); rest = ''; }
  return [out, rest];
}
