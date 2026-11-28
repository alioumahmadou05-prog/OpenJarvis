/**
 * <nour-cat> — Nour's animated cat (original design).
 *
 * A self-contained Web Component: one SVG, CSS animations, a little JS for
 * natural blinking, eye-tracking and lip-sync. Works in plain HTML, React and
 * the Electron floating companion window.
 *
 *   <nour-cat state="idle"></nour-cat>
 *   cat.state = "listening";      // one of CAT_STATES
 *   cat.level = 0.6;              // live voice loudness 0..1 (mouth/ears follow it)
 *   cat.fur = "white" | "black";  // fur colour
 */

export const CAT_STATES = [
  "sleeping", "idle", "listening", "thinking", "speaking",
  "working", "success", "error", "translating",
] as const;
export type CatState = (typeof CAT_STATES)[number];

const ACCENT: Record<CatState, string> = {
  sleeping: "#5b6b96", idle: "#46d7ff", listening: "#5ee2ff", thinking: "#a78bfa", speaking: "#46d7ff",
  working: "#fbbf24", success: "#4ade80", error: "#f87171", translating: "#34d399",
};

const SVG = /* svg */ `
<svg viewBox="-10 -22 260 286" role="img" aria-label="Nour the cat">
  <defs>
    <radialGradient id="aura" cx="50%" cy="55%" r="50%">
      <stop offset="0" stop-color="var(--accent)" stop-opacity=".30"/>
      <stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="iris" cx="50%" cy="38%" r="65%">
      <stop offset="0" stop-color="#eafcff"/>
      <stop offset=".35" stop-color="var(--accent)"/>
      <stop offset="1" stop-color="#0d5c7a"/>
    </radialGradient>
    <linearGradient id="furShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--fur)"/>
      <stop offset="1" stop-color="var(--fur-shade)"/>
    </linearGradient>
  </defs>

  <ellipse class="aura" cx="120" cy="150" rx="128" ry="128" fill="url(#aura)"/>
  <ellipse class="shadow" cx="120" cy="248" rx="62" ry="8"/>

  <g class="cat">
    <!-- tail -->
    <g class="tail"><path class="fur" d="M156 236 C 204 238, 222 204, 210 172 C 203 154, 186 152, 189 168 C 196 196, 184 220, 152 222 Z"/>
      <path class="tip" d="M210 172 C 203 154, 186 152, 189 168 C 190 172, 199 170, 206 176 Z"/></g>

    <!-- body -->
    <g class="body">
      <path class="fur" fill="url(#furShade)" d="M68 242 C 58 204, 70 160, 120 152 C 170 160, 182 204, 172 242 Z"/>
      <ellipse class="fur" cx="80" cy="234" rx="19" ry="13"/>
      <ellipse class="fur" cx="160" cy="234" rx="19" ry="13"/>
      <path class="chest" d="M98 166 Q 120 206 142 166 Q 134 190 120 194 Q 106 190 98 166 Z"/>
      <g class="paws">
        <ellipse class="fur" cx="104" cy="241" rx="13" ry="8"/>
        <ellipse class="fur" cx="136" cy="241" rx="13" ry="8"/>
        <path class="line" d="M100 238 v5 M108 238 v5 M132 238 v5 M140 238 v5"/>
      </g>
      <!-- collar & glowing tag -->
      <path class="collar" d="M84 160 Q 120 178 156 160"/>
      <g class="tag"><circle cx="120" cy="175" r="9.5"/><text x="120" y="179.2">N</text></g>
    </g>

    <!-- head -->
    <g class="head">
      <g class="ear earL"><path class="fur" d="M64 94 L 72 34 L 114 70 Z"/><path class="inner" d="M73 85 L 77 50 L 103 71 Z"/></g>
      <g class="ear earR"><path class="fur" d="M176 94 L 168 34 L 126 70 Z"/><path class="inner" d="M167 85 L 163 50 L 137 71 Z"/></g>
      <path class="fur" fill="url(#furShade)" d="M120 50 C 158 50, 184 74, 184 104 C 184 112, 182 118, 179 123 L 191 128 L 177 133 L 185 142 L 168 141 C 156 152, 140 158, 120 158 C 100 158, 84 152, 72 141 L 55 142 L 63 133 L 49 128 L 61 123 C 58 118, 56 112, 56 104 C 56 74, 82 50, 120 50 Z"/>
      <path class="fur tuft" d="M109 53 Q 112 43 118 49 Q 123 41 130 53 Z"/>

      <ellipse class="blush" cx="80" cy="126" rx="8.5" ry="4.5"/>
      <ellipse class="blush" cx="160" cy="126" rx="8.5" ry="4.5"/>

      <!-- eyes: open -->
      <g class="x eyesOpen">
        <g class="eye"><ellipse class="eyeball" cx="96" cy="104" rx="13" ry="15"/>
          <g class="look"><ellipse cx="96" cy="105" rx="9" ry="11" fill="url(#iris)"/><ellipse class="pupil" cx="96" cy="105" rx="3.6" ry="7.5"/></g>
          <circle class="shine" cx="91.5" cy="98" r="3.6"/><circle class="shine" cx="100" cy="110" r="1.6"/></g>
        <g class="eye"><ellipse class="eyeball" cx="144" cy="104" rx="13" ry="15"/>
          <g class="look"><ellipse cx="144" cy="105" rx="9" ry="11" fill="url(#iris)"/><ellipse class="pupil" cx="144" cy="105" rx="3.6" ry="7.5"/></g>
          <circle class="shine" cx="139.5" cy="98" r="3.6"/><circle class="shine" cx="148" cy="110" r="1.6"/></g>
      </g>
      <!-- eyes: closed (sleep), happy (success) -->
      <path class="x line thick eyesClosed" d="M84 104 Q 96 113 108 104 M132 104 Q 144 113 156 104"/>
      <path class="x line thick eyesHappy" d="M84 108 Q 96 93 108 108 M132 108 Q 144 93 156 108"/>

      <!-- brows per mood -->
      <path class="x line brow browThink" d="M85 82 Q 95 76 106 80 M134 86 L 155 86"/>
      <path class="x line brow browWorry" d="M86 87 L 105 80 M135 80 L 154 87"/>
      <path class="x line brow browFocus" d="M87 83 L 105 85.5 M135 85.5 L 153 83"/>

      <!-- nose, mouths -->
      <path class="nose" d="M114.5 121 L 125.5 121 L 120 127.5 Z"/>
      <path class="x line mNeutral" d="M120 127.5 Q 114 136 107 131 M120 127.5 Q 126 136 133 131"/>
      <g class="x mOpen"><path class="mouthIn" d="M111 130 Q 120 128 129 130 Q 128 145 120 145 Q 112 145 111 130 Z"/><ellipse class="tongue" cx="120" cy="141" rx="5" ry="3"/></g>
      <g class="x mSmile"><path class="mouthIn" d="M105 130 Q 120 132 135 130 Q 131 149 120 149 Q 109 149 105 130 Z"/><ellipse class="tongue" cx="120" cy="144.5" rx="6.5" ry="3.6"/></g>
      <path class="x line mFrown" d="M109 139 Q 120 131 131 139"/>
      <ellipse class="x mouthIn mO" cx="120" cy="135" rx="3.6" ry="4.2"/>

      <path class="whisk" d="M62 120 L 34 113 M62 126 L 32 127 M178 120 L 206 113 M178 126 L 208 127"/>
      <path class="x sweat" d="M176 72 C 172 80, 170 84, 174 88 C 179 91, 183 86, 180 80 Z"/>
    </g>

    <!-- working: laptop -->
    <g class="x laptop">
      <path class="lid" d="M82 192 L 158 192 L 162 236 L 78 236 Z"/>
      <circle class="logo" cx="120" cy="213" r="5"/>
      <path class="base" d="M70 236 L 170 236 L 176 247 L 64 247 Z"/>
      <g class="typing"><ellipse class="fur pawL" cx="98" cy="236" rx="11" ry="6.5"/><ellipse class="fur pawR" cx="142" cy="236" rx="11" ry="6.5"/></g>
    </g>
  </g>

  <!-- effects -->
  <g class="x zzz"><text x="182" y="40">z</text><text x="196" y="22" class="z2">z</text><text x="212" y="2" class="z3">Z</text></g>
  <g class="x waves"><path d="M196 64 q 10 13 0 26"/><path d="M206 56 q 17 21 0 42" class="w2"/><path d="M44 64 q -10 13 0 26"/><path d="M34 56 q -17 21 0 42" class="w2"/></g>
  <g class="x thought"><circle cx="186" cy="52" r="3.5"/><circle cx="196" cy="38" r="5.5"/>
    <rect x="188" y="-4" width="52" height="30" rx="15"/><g class="dots"><circle cx="202" cy="11" r="3.2"/><circle cx="214" cy="11" r="3.2"/><circle cx="226" cy="11" r="3.2"/></g></g>
  <g class="x gear"><circle class="teeth" cx="222" cy="24" r="12"/><circle class="hub" cx="222" cy="24" r="7"/><circle class="hole" cx="222" cy="24" r="3"/></g>
  <g class="x sparkles"><path d="M28 70 l4 -12 4 12 12 4 -12 4 -4 12 -4 -12 -12 -4 z"/><path class="s2" d="M206 40 l3 -9 3 9 9 3 -9 3 -3 9 -3 -9 -9 -3 z"/><path class="s3" d="M214 150 l2.5 -7 2.5 7 7 2.5 -7 2.5 -2.5 7 -2.5 -7 -7 -2.5 z"/><path class="s2" d="M18 168 l2.5 -7 2.5 7 7 2.5 -7 2.5 -2.5 7 -2.5 -7 -7 -2.5 z"/></g>
  <g class="x bubbles">
    <g class="bA"><rect x="-6" y="8" width="44" height="32" rx="10"/><path d="M14 40 l6 9 4 -9 z"/><text x="16" y="31">A</text></g>
    <g class="bB"><rect x="202" y="8" width="44" height="32" rx="10"/><path d="M226 40 l-6 9 -4 -9 z"/><text x="224" y="32">文</text></g>
    <path class="swap" d="M64 2 Q 120 -18 176 2 M170 -4 l6 6 -8 2"/>
  </g>
</svg>`;

const CSS = /* css */ `
:host { display: inline-block; width: 240px; aspect-ratio: 260 / 286; --accent: #46d7ff; --fur: #f5f7fc; --fur-shade: #dfe4f1; --ink: #141a2e; --pink: #f4a9c0; --lx: 0px; --ly: 0px; --mouth: 1; }
:host([fur="black"]) { --fur: #2a3047; --fur-shade: #1c2134; --ink: #070a14; --pink: #d98aa5; }
svg { width: 100%; height: 100%; overflow: visible; display: block; }
* { transform-box: fill-box; }
.fur { fill: var(--fur); stroke: var(--ink); stroke-width: 3; stroke-linejoin: round; }
.tip { fill: var(--fur-shade); }
.chest { fill: #fff; opacity: .55; }
:host([fur="black"]) .chest { fill: #3a4262; opacity: .7; }
.inner { fill: var(--pink); }
.line { fill: none; stroke: var(--ink); stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
:host([fur="black"]) .line, :host([fur="black"]) .whisk { stroke: #c9d2ee; }
.thick { stroke-width: 3.6; }
.whisk { fill: none; stroke: #b9c3e3; stroke-width: 1.5; stroke-linecap: round; opacity: .7; }
.blush { fill: var(--pink); opacity: .45; }
.eyeball { fill: #0b1222; }
.pupil { fill: #04070f; }
.shine { fill: #fff; }
.nose { fill: var(--pink); stroke: var(--ink); stroke-width: 1.4; stroke-linejoin: round; }
.mouthIn { fill: #3b1024; stroke: var(--ink); stroke-width: 2; }
.tongue { fill: #f27a9b; }
.collar { fill: none; stroke: #0e1836; stroke-width: 9; stroke-linecap: round; }
.tag circle { fill: #0a1330; stroke: var(--accent); stroke-width: 2; filter: drop-shadow(0 0 4px var(--accent)); }
.tag text { fill: var(--accent); font: 700 11px/1 "Inter", system-ui, sans-serif; text-anchor: middle; }
.shadow { fill: #000; opacity: .35; }
.aura { opacity: .7; transition: opacity .4s; }
.sweat { fill: #9fd8ff; stroke: #2a6c9c; stroke-width: 1.2; }
.lid { fill: #1b2340; stroke: #3c4a78; stroke-width: 2; }
.logo { fill: var(--accent); filter: drop-shadow(0 0 5px var(--accent)); }
.base { fill: #2b3557; stroke: #3c4a78; stroke-width: 2; }
.zzz text { fill: #a9b8e6; font: 700 18px/1 "Inter", system-ui, sans-serif; }
.waves path { fill: none; stroke: var(--accent); stroke-width: 3; stroke-linecap: round; }
.thought circle, .thought rect { fill: #e9eefc; stroke: var(--ink); stroke-width: 2; }
.thought .dots circle { fill: #5b4fc7; stroke: none; }
.gear .teeth { fill: none; stroke: var(--accent); stroke-width: 6; stroke-dasharray: 4.2 3.6; }
.gear .hub { fill: var(--accent); }
.gear .hole { fill: #0b1222; }
.sparkles path { fill: var(--accent); filter: drop-shadow(0 0 4px var(--accent)); }
.bubbles rect, .bubbles path:not(.swap) { fill: #0f1a33; stroke: var(--accent); stroke-width: 2; }
.bubbles text { fill: #eafff6; font: 700 19px/1 "Inter", system-ui, sans-serif; text-anchor: middle; }
.bubbles .swap { fill: none; stroke: var(--accent); stroke-width: 2.4; stroke-linecap: round; stroke-dasharray: 5 6; }

/* every optional piece fades in/out so expressions change smoothly */
.x { opacity: 0; transition: opacity .28s ease; }

/* transform origins */
.cat { transform-origin: 50% 100%; }
.body { transform-origin: 50% 100%; }
.head { transform-origin: 50% 92%; transition: transform .5s cubic-bezier(.3,1.4,.5,1); }
.earL { transform-origin: 70% 100%; transition: transform .35s; } .earR { transform-origin: 30% 100%; transition: transform .35s; }
.tail { transform-origin: 0% 90%; }
.eye { transform-origin: 50% 50%; transition: transform .09s; }
.look { transform: translate(var(--lx), var(--ly)); transition: transform .18s ease-out; }
.mOpen { transform-origin: 50% 0%; }

/* ---------- always-on life ---------- */
.body { animation: breathe 3.6s ease-in-out infinite; }
.tail { animation: sway 3s ease-in-out infinite; }
.earR { animation: twitch 7s infinite; }
.blink .eye { transform: scaleY(.08); }

/* ---------- states ---------- */
/* default face (idle) */
:host(:not([state])) .eyesOpen, :host(:not([state])) .mNeutral,
:host([state="idle"]) .eyesOpen, :host([state="idle"]) .mNeutral { opacity: 1; }

/* sleeping */
:host([state="sleeping"]) .eyesClosed, :host([state="sleeping"]) .mNeutral, :host([state="sleeping"]) .zzz { opacity: 1; }
:host([state="sleeping"]) .head { transform: translateY(7px) rotate(-7deg); }
:host([state="sleeping"]) .body { animation-duration: 5.5s; }
:host([state="sleeping"]) .tail { animation: none; transform: rotate(-14deg); }
:host([state="sleeping"]) .earL { transform: rotate(-10deg); } :host([state="sleeping"]) .earR { transform: rotate(10deg); animation: none; }
:host([state="sleeping"]) .aura { opacity: .25; }
.zzz text { animation: zfloat 3s ease-in-out infinite; } .zzz .z2 { animation-delay: .8s; } .zzz .z3 { animation-delay: 1.6s; }

/* listening */
:host([state="listening"]) .eyesOpen, :host([state="listening"]) .mO, :host([state="listening"]) .waves { opacity: 1; }
:host([state="listening"]) .earL { transform: rotate(8deg) scale(1.1); } :host([state="listening"]) .earR { transform: rotate(-8deg) scale(1.1); animation: none; }
:host([state="listening"]) .head { transform: rotate(4deg); }
:host([state="listening"]) .eye { transform: scale(1.08); }
:host([state="listening"]) .tail { animation-duration: 1.6s; }
:host([state="listening"]) .aura { animation: pulse 1.6s ease-in-out infinite; }
.waves path { animation: wave 1.4s ease-out infinite; } .waves .w2 { animation-delay: .35s; }

/* thinking */
:host([state="thinking"]) .eyesOpen, :host([state="thinking"]) .browThink, :host([state="thinking"]) .thought { opacity: 1; }
:host([state="thinking"]) .mFrown { opacity: .0; }
:host([state="thinking"]) .mNeutral { opacity: 1; }
:host([state="thinking"]) .look { transform: translate(4px, -4px); }
:host([state="thinking"]) .head { transform: rotate(-6deg); }
:host([state="thinking"]) .tail { animation-duration: 4.5s; }
.thought .dots circle { animation: dot 1.2s ease-in-out infinite; } .thought .dots circle:nth-child(2) { animation-delay: .2s; } .thought .dots circle:nth-child(3) { animation-delay: .4s; }

/* speaking */
:host([state="speaking"]) .eyesOpen, :host([state="speaking"]) .mOpen { opacity: 1; }
:host([state="speaking"]) .mOpen { animation: talk .34s ease-in-out infinite alternate; }
:host([state="speaking"][data-live]) .mOpen { animation: none; transform: scaleY(var(--mouth)); transition: transform .06s; }
:host([state="speaking"]) .head { animation: nod 2.4s ease-in-out infinite; }
:host([state="speaking"]) .aura { animation: pulse 1.1s ease-in-out infinite; }

/* working */
:host([state="working"]) .eyesOpen, :host([state="working"]) .browFocus, :host([state="working"]) .mNeutral,
:host([state="working"]) .laptop, :host([state="working"]) .gear { opacity: 1; }
:host([state="working"]) .look { transform: translate(0, 4px); }
:host([state="working"]) .paws { opacity: 0; }
:host([state="working"]) .head { transform: translateY(3px); }
.typing .pawL { animation: type .28s ease-in-out infinite alternate; transform-origin: 50% 100%; }
.typing .pawR { animation: type .28s ease-in-out infinite alternate-reverse; transform-origin: 50% 100%; }
.gear { transform-origin: 50% 50%; animation: spin 3s linear infinite; }
.logo { animation: glow 1.4s ease-in-out infinite; }

/* success */
:host([state="success"]) .eyesHappy, :host([state="success"]) .mSmile, :host([state="success"]) .sparkles { opacity: 1; }
:host([state="success"]) .cat { animation: hop 1.1s cubic-bezier(.3,.7,.4,1) infinite; }
:host([state="success"]) .tail { animation-duration: .5s; }
:host([state="success"]) .blush { opacity: .75; }
.sparkles path { transform-origin: 50% 50%; animation: twinkle 1.2s ease-in-out infinite; } .sparkles .s2 { animation-delay: .4s; } .sparkles .s3 { animation-delay: .8s; }

/* error */
:host([state="error"]) .eyesOpen, :host([state="error"]) .browWorry, :host([state="error"]) .mFrown, :host([state="error"]) .sweat { opacity: 1; }
:host([state="error"]) .eye { transform: scale(.82); }
:host([state="error"]) .earL { transform: rotate(-28deg); } :host([state="error"]) .earR { transform: rotate(28deg); animation: none; }
:host([state="error"]) .head { animation: shake .45s ease-in-out 3; }
:host([state="error"]) .tail { animation: none; transform: rotate(24deg); }
:host([state="error"]) .sweat { animation: drip 2s ease-in infinite; }

/* translating */
:host([state="translating"]) .eyesOpen, :host([state="translating"]) .mNeutral, :host([state="translating"]) .bubbles { opacity: 1; }
:host([state="translating"]) .earL { transform: rotate(6deg) scale(1.06); } :host([state="translating"]) .earR { transform: rotate(-6deg) scale(1.06); animation: none; }
:host([state="translating"]) .head { animation: look 4s ease-in-out infinite; }
.bubbles .bA { transform-origin: 50% 100%; animation: bub 2.4s ease-in-out infinite; }
.bubbles .bB { transform-origin: 50% 100%; animation: bub 2.4s ease-in-out 1.2s infinite; }
.bubbles .swap { animation: dash 1.2s linear infinite; }

/* ---------- keyframes ---------- */
@keyframes breathe { 50% { transform: scaleY(1.025) scaleX(.995); } }
@keyframes sway { 0%,100% { transform: rotate(-5deg); } 50% { transform: rotate(9deg); } }
@keyframes twitch { 0%, 88%, 100% { transform: rotate(0); } 91% { transform: rotate(-12deg); } 94% { transform: rotate(3deg); } }
@keyframes zfloat { 0% { opacity: 0; transform: translate(0, 8px); } 30% { opacity: 1; } 100% { opacity: 0; transform: translate(10px, -14px); } }
@keyframes pulse { 50% { opacity: 1; transform: scale(1.04); } }
@keyframes wave { 0% { opacity: 0; } 30% { opacity: 1; } 100% { opacity: 0; } }
@keyframes dot { 0%, 100% { transform: translateY(0); opacity: .5; } 50% { transform: translateY(-4px); opacity: 1; } }
@keyframes talk { from { transform: scaleY(.25); } to { transform: scaleY(1); } }
@keyframes nod { 0%,100% { transform: rotate(0); } 30% { transform: rotate(2deg) translateY(-1px); } 70% { transform: rotate(-2deg); } }
@keyframes type { from { transform: translateY(0); } to { transform: translateY(-5px); } }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes glow { 50% { opacity: .45; } }
@keyframes hop { 0%, 100% { transform: translateY(0) scale(1, 1); } 12% { transform: translateY(0) scale(1.04, .95); } 40% { transform: translateY(-16px) scale(.98, 1.03); } 70% { transform: translateY(0) scale(1.03, .97); } }
@keyframes twinkle { 0%, 100% { transform: scale(.4) rotate(0); opacity: .3; } 50% { transform: scale(1.1) rotate(25deg); opacity: 1; } }
@keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-4px) rotate(-2deg); } 75% { transform: translateX(4px) rotate(2deg); } }
@keyframes drip { 0% { transform: translateY(-4px); opacity: 0; } 20% { opacity: 1; } 100% { transform: translateY(12px); opacity: 0; } }
@keyframes look { 0%, 100% { transform: rotate(-4deg); } 50% { transform: rotate(4deg); } }
@keyframes bub { 0%, 100% { transform: scale(.85); opacity: .55; } 50% { transform: scale(1.06); opacity: 1; } }
@keyframes dash { to { stroke-dashoffset: -22; } }

@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; } }
`;

const BLINKS_IN: CatState[] = ["idle", "listening", "thinking", "speaking", "working", "translating"];

export class NourCat extends HTMLElement {
  static get observedAttributes() { return ["state"]; }
  private root: ShadowRoot;
  private blinkTimer = 0;
  private liveTimer = 0;
  private onPointer = (e: PointerEvent) => this.follow(e);

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${CSS}</style>${SVG}`;
  }

  get state(): CatState { return (this.getAttribute("state") as CatState) || "idle"; }
  set state(s: CatState) { if (CAT_STATES.includes(s)) this.setAttribute("state", s); }

  get fur(): string { return this.getAttribute("fur") || "white"; }
  set fur(f: string) { this.setAttribute("fur", f); }

  /** Live loudness of Nour's own voice (0..1): drives the mouth while speaking. */
  set level(v: number) {
    const l = Math.max(0, Math.min(1, v || 0));
    this.style.setProperty("--mouth", String(0.15 + l * 0.95));
    this.setAttribute("data-live", "");
    clearTimeout(this.liveTimer);
    this.liveTimer = window.setTimeout(() => this.removeAttribute("data-live"), 250);
  }

  connectedCallback() {
    if (!this.hasAttribute("state")) this.setAttribute("state", "idle");
    this.applyAccent();
    window.addEventListener("pointermove", this.onPointer, { passive: true });
    this.scheduleBlink();
  }

  disconnectedCallback() {
    window.removeEventListener("pointermove", this.onPointer);
    clearTimeout(this.blinkTimer);
  }

  attributeChangedCallback() {
    this.applyAccent();
    if (this.state !== "idle") { this.style.setProperty("--lx", "0px"); this.style.setProperty("--ly", "0px"); }
  }

  private applyAccent() { this.style.setProperty("--accent", ACCENT[this.state] || ACCENT.idle); }

  /** Natural, irregular blinking (sometimes a double blink). */
  private scheduleBlink() {
    this.blinkTimer = window.setTimeout(() => {
      const eyes = this.root.querySelector(".eyesOpen");
      if (eyes && BLINKS_IN.includes(this.state)) {
        eyes.classList.add("blink");
        setTimeout(() => eyes.classList.remove("blink"), 130);
        if (Math.random() < 0.2) setTimeout(() => { eyes.classList.add("blink"); setTimeout(() => eyes.classList.remove("blink"), 120); }, 260);
      }
      this.scheduleBlink();
    }, 2200 + Math.random() * 4200);
  }

  /** When idle, the eyes follow the pointer a little. */
  private follow(e: PointerEvent) {
    if (this.state !== "idle") return;
    const r = this.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height * 0.38;
    const dx = e.clientX - cx, dy = e.clientY - cy, d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / 300);
    this.style.setProperty("--lx", `${((dx / d) * 3.2 * k).toFixed(2)}px`);
    this.style.setProperty("--ly", `${((dy / d) * 3.2 * k).toFixed(2)}px`);
  }
}

if (!customElements.get("nour-cat")) customElements.define("nour-cat", NourCat);
