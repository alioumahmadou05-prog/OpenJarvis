/**
 * <nour-sprite> — frame-by-frame sprite-sheet player for Nour's Nx monkey.
 *
 * Plays pre-rendered sprite sheets (assets/sprites/nx/*.webp + atlas.json) on a transparent canvas:
 *   - one sheet per animation sequence, played frame by frame at its own fps
 *   - seamless loops, and cross-faded transitions between sequences
 *   - voice-synchronised mouth: viseme sprites drawn on the per-frame mouth anchor
 *   - automatic state switching (one-shot sequences return to idle, idle falls asleep,
 *     speech switches to `speaking` and back)
 *
 *   <nour-sprite src="assets/sprites/nx/"></nour-sprite>
 *   el.state = "listening";            // idle, listening, thinking, speaking, walking, running,
 *                                      // dancing, sleeping, waving, celebrating, error
 *   el.level = 0.7;                    // live voice loudness (0..1) → mouth shape
 *   await el.say("Salut ! Hey, it's Nour.", voice);   // speaks with NourVoice and lip-syncs
 */

export interface SpriteSequence {
  sheet: string; cols: number; frames: number; fps: number; loop: boolean;
  next: string | null; mouthAnchors?: [number, number, number][];
}
export interface SpriteAtlas {
  version: number; frame: { w: number; h: number };
  sequences: Record<string, SpriteSequence>;
  mouth: { sheet: string; w: number; h: number; cx: number; cy: number; visemes: string[] } | null;
}
export interface Speaker { speak(text: string, hooks: { onStart?: () => void; onWord?: () => void; onEnd?: () => void }): Promise<void>; stop(): void }

/** How a state ends by itself: number of cycles, then the state it goes to. */
const AUTO_RETURN: Record<string, { cycles: number; to: string }> = {
  waving: { cycles: 3, to: "idle" }, celebrating: { cycles: 1, to: "idle" }, error: { cycles: 3, to: "idle" },
};
const FADE_MS = 180;

interface Track { name: string; t: number }   // t = seconds since the sequence started

export class NourSprite extends HTMLElement {
  static get observedAttributes() { return ["src", "state"]; }
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private atlas: SpriteAtlas | null = null;
  private images = new Map<string, HTMLImageElement>();
  private cur: Track = { name: "idle", t: 0 };
  private prev: Track | null = null;
  private fade = 1;
  private last = 0;
  private raf = 0;
  private mouthLevel = 0;
  private mouthTarget = 0;
  private lastLevelAt = 0;
  private lastWordAt = 0;
  private talking = false;
  private beforeTalk = "idle";
  private idleSince = performance.now();
  /** Fall asleep after this many ms of idling (0 = never). */
  sleepAfter = 90000;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>:host{display:inline-block;width:280px;aspect-ratio:348/423;line-height:0}canvas{width:100%;height:100%;display:block}</style><canvas part="canvas" role="img" aria-label="Nour, the Nx monkey"></canvas>`;
    this.canvas = root.querySelector("canvas")!;
    this.ctx = this.canvas.getContext("2d")!;
  }

  // ---------------------------------------------------------------- public API
  get state(): string { return this.cur.name; }
  set state(name: string) { this.setAttribute("state", name); }
  get states(): string[] { return this.atlas ? Object.keys(this.atlas.sequences) : []; }

  /** Live voice loudness 0..1 (drives the mouth while speaking). */
  set level(v: number) { this.mouthTarget = Math.max(0, Math.min(1, v || 0)); this.lastLevelAt = performance.now(); }

  /** Load from a folder URL containing atlas.json, or from an atlas object + a map of sheet → URL. */
  async load(src: string | SpriteAtlas, urls?: Record<string, string>) {
    const atlas: SpriteAtlas = typeof src === "string" ? await (await fetch(src.replace(/\/?$/, "/") + "atlas.json")).json() : src;
    const base = typeof src === "string" ? src.replace(/\/?$/, "/") : "";
    const sheets = [...Object.values(atlas.sequences).map(s => s.sheet), ...(atlas.mouth ? [atlas.mouth.sheet] : [])];
    await Promise.all(sheets.map(sheet => new Promise<void>((res, rej) => {
      const img = new Image(); img.decoding = "async";
      img.onload = () => { this.images.set(sheet, img); res(); }; img.onerror = () => rej(new Error("cannot load " + sheet));
      img.src = urls?.[sheet] ?? base + sheet;
    })));
    this.atlas = atlas;
    this.canvas.width = atlas.frame.w; this.canvas.height = atlas.frame.h;
    this.style.aspectRatio = `${atlas.frame.w} / ${atlas.frame.h}`;
    const want = this.getAttribute("state");
    this.cur = { name: want && atlas.sequences[want] ? want : "idle", t: 0 };
    this.dispatchEvent(new CustomEvent("ready"));
  }

  /** Speak with a voice (e.g. NourVoice) and lip-sync, then return to the previous state. */
  async say(text: string, voice: Speaker) {
    this.wake();
    if (!this.talking) this.beforeTalk = this.cur.name === "speaking" || this.cur.name === "sleeping" ? "idle" : this.cur.name;
    await voice.speak(text, {
      onStart: () => { this.talking = true; this.go("speaking"); },
      onWord: () => { this.lastWordAt = performance.now(); },
      onEnd: () => { this.talking = false; this.go(this.beforeTalk); },
    });
  }

  /** Any activity resets the sleep timer (and wakes Nour up). */
  wake() { this.idleSince = performance.now(); if (this.cur.name === "sleeping") this.go("idle"); }

  // ---------------------------------------------------------------- lifecycle
  connectedCallback() {
    const src = this.getAttribute("src");
    if (src && !this.atlas) this.load(src).catch(e => console.error(e));
    this.last = performance.now();
    const tick = (now: number) => { this.raf = requestAnimationFrame(tick); this.frame(now); };
    this.raf = requestAnimationFrame(tick);
  }
  disconnectedCallback() { cancelAnimationFrame(this.raf); }
  attributeChangedCallback(name: string, _old: string | null, value: string | null) {
    if (name === "state" && value) { this.idleSince = performance.now(); this.go(value); }
    if (name === "src" && value && this.isConnected && !this.atlas) this.load(value).catch(e => console.error(e));
  }

  // ---------------------------------------------------------------- internals
  private go(name: string) {
    if (this.atlas && !this.atlas.sequences[name]) return;
    if (name === this.cur.name) return;
    if (this.getAttribute("state") !== name) this.setAttribute("state", name);
    this.prev = this.cur; this.cur = { name, t: 0 }; this.fade = 0;
    this.dispatchEvent(new CustomEvent("statechange", { detail: { state: name, from: this.prev.name } }));
  }

  private frameIndex(seq: SpriteSequence, t: number) {
    const n = Math.floor(t * seq.fps);
    return seq.loop ? n % seq.frames : Math.min(n, seq.frames - 1);
  }

  private frame(now: number) {
    const dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    const A = this.atlas; if (!A) return;
    this.cur.t += dt; if (this.prev) this.prev.t += dt;
    if (this.fade < 1) { this.fade = Math.min(1, this.fade + (dt * 1000) / FADE_MS); if (this.fade >= 1) this.prev = null; }

    // automatic switching
    const seq = A.sequences[this.cur.name], cycle = seq.frames / seq.fps;
    const auto = AUTO_RETURN[this.cur.name] || (seq.next ? { cycles: 1, to: seq.next } : null);
    if (auto && this.cur.t >= auto.cycles * cycle - 1 / seq.fps) this.go(auto.to);
    if (this.cur.name === "idle" && this.sleepAfter > 0 && now - this.idleSince > this.sleepAfter) this.go("sleeping");
    if (this.cur.name !== "idle") this.idleSince = Math.max(this.idleSince, now - 1); // timer only runs while idle

    // mouth: live level if fed, else from word boundaries, else a natural chatter while talking
    let target = 0;
    if (now - this.lastLevelAt < 250) target = this.mouthTarget;
    else if (this.talking) { const since = now - this.lastWordAt; target = since < 600 ? Math.max(0.1, 1 - since / 240) * (0.65 + 0.35 * Math.sin(now / 37)) : 0.3 + 0.5 * Math.abs(Math.sin(now / 90)); }
    this.mouthLevel += (target - this.mouthLevel) * (target > this.mouthLevel ? 0.6 : 0.3);

    const c = this.ctx; c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.prev && this.fade < 1) this.draw(this.prev, 1 - this.fade);
    this.draw(this.cur, this.prev ? this.fade : 1);
  }

  private draw(track: Track, alpha: number) {
    const A = this.atlas!, seq = A.sequences[track.name], img = this.images.get(seq.sheet); if (!img) return;
    const i = this.frameIndex(seq, track.t), { w, h } = A.frame, c = this.ctx;
    c.globalAlpha = alpha;
    c.drawImage(img, (i % seq.cols) * w, Math.floor(i / seq.cols) * h, w, h, 0, 0, w, h);
    const m = A.mouth, anchor = seq.mouthAnchors?.[i], mimg = m && this.images.get(m.sheet);
    if (m && anchor && mimg) {
      const l = this.mouthLevel, v = l < 0.07 ? "closed" : l < 0.3 ? "small" : l < 0.62 ? "mid" : "wide";
      const k = Math.max(0, m.visemes.indexOf(v));
      c.save(); c.translate(anchor[0], anchor[1]); c.rotate((anchor[2] * Math.PI) / 180);
      c.drawImage(mimg, k * m.w, 0, m.w, m.h, -m.cx, -m.cy, m.w, m.h); c.restore();
    }
    c.globalAlpha = 1;
  }
}

if (!customElements.get("nour-sprite")) customElements.define("nour-sprite", NourSprite);
