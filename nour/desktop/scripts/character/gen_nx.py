"""Generate src/renderer/character/nour-nx.ts: the user's Nx monkey, traced 1:1, rigged and animated."""
import json, sys, math

T = json.load(open("monkey-trace2.json"))
BB = T["bbox"]
out_path = sys.argv[1]

# pivots in full-image coordinates
PIV = {"head": (611, 702), "armL": (445, 790), "armR": (764, 790), "legL": (552, 936), "legR": (700, 936),
       "tail": (780, 940), "torso": (611, 936), "rig": (611, 1074)}

def box(part, extra=None):
    """Fixed bounding box (so CSS transform-origin stays on the pivot), returns rect + origin %."""
    x0, y0, x1, y1 = BB.get(part, (PIV[part][0], PIV[part][1], PIV[part][0], PIV[part][1]))
    if extra: x0, y0, x1, y1 = min(x0, extra[0]), min(y0, extra[1]), max(x1, extra[2]), max(y1, extra[3])
    px, py = PIV[part]
    # make the box symmetric around the pivot horizontally so props never shift the origin
    half = max(px - x0, x1 - px) + 120
    x0, x1 = px - half, px + half
    y0, y1 = min(y0, py) - 120, max(y1, py) + 120
    ox = (px - x0) / (x1 - x0) * 100; oy = (py - y0) / (y1 - y0) * 100
    return f'<rect class="bb" x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}"/>', f"{ox:.3f}% {oy:.3f}%"

def art(layers):
    return "".join(f'<g class="t" transform="{l["tr"]}"><path fill="{l["fill"]}" d="{l["d"]}"/></g>' for l in layers)

P = T["parts"]
origins = {}
def grp(cls, part, inner, extra=None, use=None):
    rect, o = box(part, extra); origins[cls] = o
    return f'<g class="{cls}">{rect}{inner}</g>'

# ---------------- props & overlays (full-image coordinates) ----------------
EYES = '''<g class="eyes">
  <ellipse cx="541" cy="567" rx="11" ry="15" fill="#0b0806"/><ellipse cx="683" cy="567" rx="11" ry="15" fill="#0b0806"/>
  <circle cx="537" cy="561" r="4" fill="#fff"/><circle cx="679" cy="561" r="4" fill="#fff"/>
</g>'''
FACE = '''
<g class="x mcover"><ellipse cx="611" cy="651" rx="50" ry="21" fill="var(--face)"/></g>
<g class="x mOpen"><path d="M588 640 Q 611 645 634 640 Q 631 669 611 669 Q 591 669 588 640 Z" fill="#3a1206" stroke="#0b0806" stroke-width="5" stroke-linejoin="round"/><ellipse cx="611" cy="661" rx="10" ry="5" fill="#e8705d"/></g>
<g class="x mSmile"><path d="M576 639 Q 611 648 646 639 Q 641 679 611 679 Q 581 679 576 639 Z" fill="#3a1206" stroke="#0b0806" stroke-width="5" stroke-linejoin="round"/><ellipse cx="611" cy="669" rx="14" ry="6.5" fill="#e8705d"/></g>
<path class="x mFrown ln" d="M588 663 Q 611 640 634 663"/>
<path class="x mFlat ln" d="M590 654 Q 611 648 632 654"/>
<ellipse class="x mO" cx="611" cy="654" rx="8" ry="10" fill="#3a1206" stroke="#0b0806" stroke-width="4"/>
<path class="x brow bWorry ln thick" d="M504 504 Q 540 500 576 486 M646 486 Q 682 500 718 504"/>
<path class="x brow bAngry ln thick" d="M504 486 Q 540 492 578 506 M644 506 Q 682 492 718 486"/>
<path class="x brow bRaise ln thick" d="M504 494 Q 540 470 578 488 M646 500 L 718 500"/>
<ellipse class="x flush" cx="611" cy="590" rx="150" ry="105" fill="#ff2a1a"/>
<path class="x sweat" d="M752 512 C 744 530, 740 540, 748 550 C 758 558, 768 548, 762 534 Z" fill="#9fd8ff" stroke="#0b0806" stroke-width="3"/>
<path class="x tear" d="M541 626 C 535 640, 532 648, 538 655 C 545 661, 553 653, 549 642 Z" fill="#9fd8ff" stroke="#0b0806" stroke-width="3"/>
'''
# props held in the right hand (arm-local coords, hand ~ (760, 915))
MUG = '''<g class="x prop mug"><path d="M738 900 h44 v40 q0 14 -14 14 h-16 q-14 0 -14 -14 z" fill="#f4f1ea" stroke="#0b0806" stroke-width="5"/><path d="M782 910 q18 0 18 14 q0 14 -18 14" fill="none" stroke="#0b0806" stroke-width="5"/><rect x="738" y="912" width="44" height="10" fill="var(--accent)"/>
  <path class="steam" d="M750 892 q-8 -12 0 -24 q8 -12 0 -24 M768 892 q-8 -12 0 -24 q8 -12 0 -24" fill="none" stroke="#cfd6e6" stroke-width="4" stroke-linecap="round"/></g>'''
PHONE = '''<g class="x prop phone"><rect x="738" y="880" width="46" height="84" rx="9" fill="#14161f" stroke="#0b0806" stroke-width="5"/><rect x="744" y="888" width="34" height="66" rx="4" fill="#1d3b5c"/>
  <g class="scroll"><rect x="748" y="894" width="26" height="6" rx="3" fill="#7fd3ff"/><rect x="748" y="906" width="20" height="6" rx="3" fill="#cfe9ff"/><rect x="748" y="918" width="26" height="6" rx="3" fill="#7fd3ff"/><rect x="748" y="930" width="16" height="6" rx="3" fill="#cfe9ff"/><rect x="748" y="942" width="24" height="6" rx="3" fill="#7fd3ff"/></g></g>'''
THUMB = '''<g class="x prop thumb"><rect x="748" y="866" width="22" height="46" rx="11" fill="var(--face)" stroke="#0b0806" stroke-width="5"/></g>'''
PEN = '''<g class="x prop pen"><rect x="752" y="880" width="10" height="70" rx="4" fill="var(--accent)" stroke="#0b0806" stroke-width="4"/><path d="M752 950 l5 14 5 -14 z" fill="#0b0806"/></g>'''
# held in the left hand (hand ~ (455, 915))
CLIP = '''<g class="x prop clip"><rect x="400" y="860" width="96" height="124" rx="8" fill="#b9874f" stroke="#0b0806" stroke-width="5"/><rect x="410" y="874" width="76" height="102" fill="#fbfbfb"/><rect x="430" y="852" width="36" height="16" rx="5" fill="#9aa3b5" stroke="#0b0806" stroke-width="4"/>
  <path d="M420 892 h52 M420 908 h46 M420 924 h52 M420 940 h36 M420 956 h48" stroke="#9aa3b5" stroke-width="5" stroke-linecap="round"/><path class="tick" d="M418 890 l6 7 12 -14" fill="none" stroke="var(--accent)" stroke-width="5" stroke-linecap="round"/></g>'''
WATCH = '''<g class="x prop watch"><rect x="436" y="884" width="38" height="16" rx="4" fill="#14161f"/><circle cx="455" cy="892" r="14" fill="#fbfbfb" stroke="#0b0806" stroke-width="5"/><path class="hand" d="M455 892 v-9" stroke="#0b0806" stroke-width="3" stroke-linecap="round"/></g>'''
# props held in front with both hands (rig coords)
BOOK = '''<g class="x prop book"><path d="M512 838 q50 -14 99 6 v116 q-49 -20 -99 -6 z" fill="#1e3a8a" stroke="#0b0806" stroke-width="5"/><path d="M710 838 q-50 -14 -99 6 v116 q49 -20 99 -6 z" fill="#1e3a8a" stroke="#0b0806" stroke-width="5"/>
  <path class="page" d="M611 846 q-40 -12 -86 0 v104 q46 -12 86 0 z" fill="#fbfbfb" stroke="#0b0806" stroke-width="3"/><text x="660" y="912" class="bookt">Nx</text></g>'''
LAPTOP = '''<g class="x prop laptop"><path d="M520 820 h182 l10 112 h-202 z" fill="#1b2340" stroke="#3c4a78" stroke-width="5"/><circle class="logo" cx="611" cy="872" r="10" fill="var(--accent)"/><path d="M492 932 h238 l16 22 h-270 z" fill="#2b3557" stroke="#3c4a78" stroke-width="5"/>
  <g class="typing"><circle class="kL" cx="566" cy="934" r="16" fill="var(--face)" stroke="#0b0806" stroke-width="5"/><circle class="kR" cx="656" cy="934" r="16" fill="var(--face)" stroke="#0b0806" stroke-width="5"/></g></g>'''
CLOTH = '''<g class="x prop cloth"><rect x="586" y="870" width="52" height="40" rx="8" fill="#8fd3ff" stroke="#0b0806" stroke-width="4"/></g>'''

EFFECTS = '''
<g class="x fx zzz"><text x="770" y="440">z</text><text x="812" y="392" class="z2">z</text><text x="856" y="338" class="z3">Z</text></g>
<g class="x fx waves"><path d="M330 540 q -22 30 0 60"/><path d="M304 520 q -36 50 0 100" class="w2"/><path d="M892 540 q 22 30 0 60"/><path d="M918 520 q 36 50 0 100" class="w2"/></g>
<g class="x fx thought"><circle cx="810" cy="410" r="9"/><circle cx="840" cy="372" r="14"/><rect x="820" y="270" width="140" height="74" rx="37"/><g class="dots"><circle cx="856" cy="307" r="9"/><circle cx="890" cy="307" r="9"/><circle cx="924" cy="307" r="9"/></g></g>
<g class="x fx bulb"><g class="rays"><path d="M611 238 v-34 M676 262 l24 -24 M546 262 l-24 -24 M700 320 h34 M522 320 h-34"/></g><circle cx="611" cy="318" r="40" fill="#ffe066" stroke="#0b0806" stroke-width="6"/><rect x="591" y="352" width="40" height="30" rx="6" fill="#9aa3b5" stroke="#0b0806" stroke-width="5"/></g>
<g class="x fx qmarks"><text x="800" y="420">?</text><text x="400" y="400" class="q2">?</text><text x="860" y="340" class="q3">?</text></g>
<g class="x fx sparkles"><path d="M360 600 l10 -30 10 30 30 10 -30 10 -10 30 -10 -30 -30 -10 z"/><path class="s2" d="M860 420 l8 -24 8 24 24 8 -24 8 -8 24 -8 -24 -24 -8 z"/><path class="s3" d="M880 780 l7 -20 7 20 20 7 -20 7 -7 20 -7 -20 -20 -7 z"/><path class="s2" d="M340 820 l7 -20 7 20 20 7 -20 7 -7 20 -7 -20 -20 -7 z"/></g>
<g class="x fx notes"><text x="350" y="520">♪</text><text x="860" y="460" class="n2">♫</text><text x="880" y="680" class="n3">♪</text></g>
<g class="x fx steam"><path d="M372 560 q-20 -20 0 -40 q20 -20 0 -40"/><path d="M852 560 q20 -20 0 -40 q-20 -20 0 -40"/></g>
<g class="x fx bubbles"><g class="bA"><rect x="290" y="330" width="110" height="80" rx="22"/><path d="M340 410 l14 22 10 -22 z"/><text x="345" y="388">A</text></g><g class="bB"><rect x="824" y="330" width="110" height="80" rx="22"/><path d="M884 410 l-14 22 -10 -22 z"/><text x="879" y="390">文</text></g><path class="swap" d="M430 300 Q 611 240 792 300 M778 284 l16 16 -20 6"/></g>
<g class="x fx dots3"><rect x="800" y="330" width="130" height="64" rx="32"/><circle cx="834" cy="362" r="8"/><circle cx="865" cy="362" r="8"/><circle cx="896" cy="362" r="8"/></g>
<g class="x fx burst"><path d="M611 300 v-50 M700 330 l34 -34 M522 330 l-34 -34 M760 420 h46 M462 420 h-46"/></g>
<g class="x fx dust"><circle cx="500" cy="1070" r="22"/><circle cx="460" cy="1060" r="14"/><circle cx="722" cy="1070" r="22"/><circle cx="762" cy="1060" r="14"/></g>
'''

def arm(cls, base, prop=""):
    rect, o = box(base); origins[cls] = o
    return f'<g class="{cls}">{rect}<use href="#art-{base}"/>{prop}</g>'

head_inner = art(P["head"]) + EYES + f'<g class="glasses">{art(T["glasses"])}</g>' + FACE
SVG = f'''
<svg viewBox="250 210 760 920" role="img" aria-label="Nour, the Nx monkey">
  <defs>
    <radialGradient id="aura" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="var(--accent)" stop-opacity=".22"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></radialGradient>
    <clipPath id="floor"><rect x="0" y="0" width="1254" height="1082"/></clipPath>
    <g id="art-armL">{art(P["armL"])}</g><g id="art-armR">{art(P["armR"])}</g>
  </defs>
  <ellipse class="aura" cx="611" cy="700" rx="380" ry="420" fill="url(#aura)"/>
  <ellipse class="shadow" cx="611" cy="1080" rx="170" ry="18"/>
  <ellipse class="x portal" cx="611" cy="1078" rx="230" ry="40"/>
  <g clip-path="url(#floor)"><g class="rig">{box("rig", (353, 230, 910, 1074))[0]}
    {grp("tail", "tail", art(P["tail"]))}
    {grp("legL", "legL", art(P["legL"]))}
    {grp("legR", "legR", art(P["legR"]))}
    {arm("armL", "armL")}
    {arm("armR", "armR")}
    {grp("torso", "torso", art(P["torso"]))}
    {grp("head", "head", head_inner, (300, 240, 922, 702))}
    {BOOK}{LAPTOP}{CLOTH}
    {arm("armLF", "armL", CLIP + WATCH)}
    {arm("armRF", "armR", MUG + PHONE + THUMB + PEN)}
    {EFFECTS}
  </g></g>
</svg>'''
origins["rig"] = box("rig", (353, 230, 910, 1074))[1]

STATES = ["sleeping", "idle", "listening", "thinking", "speaking", "working", "success", "error", "translating"]
ACTIONS = ["walk", "coffee", "glasses", "reading", "phone", "clipboard", "idea", "confused", "sad", "angry",
           "thumbsup", "waiting", "dance", "celebrate", "sixseven", "wave", "portal-in", "portal-out", "fall", "entrance"]

ACCENT = {"sleeping": "#5b6b96", "idle": "#46d7ff", "listening": "#5ee2ff", "thinking": "#a78bfa", "speaking": "#46d7ff",
          "working": "#fbbf24", "success": "#4ade80", "error": "#f87171", "translating": "#34d399"}

def S(names, rule):
    names = names if isinstance(names, list) else [names]
    return ", ".join(f':host([state="{n}"]) {rule}' for n in names)

def show(state, *cls):
    return ", ".join(f':host([state="{state}"]) .{c}' for c in cls) + " { opacity: 1; }"

CSS = f'''
:host {{ display: inline-block; width: 260px; aspect-ratio: 760 / 920; --accent: #46d7ff; --fur: #8e3f0f; --fur-d: #6c2c0a; --face: #f8b682; --face-d: #de8c5c; --mouth: 1; }}
svg {{ width: 100%; height: 100%; display: block; overflow: visible; }}
* {{ transform-box: fill-box; }}
.t {{ transform-box: view-box; transform-origin: 0 0; }}
.bb {{ fill: none; stroke: none; }}
.shadow {{ fill: #000; opacity: .45; }}
.aura {{ opacity: .8; }}
.ln {{ fill: none; stroke: #0b0806; stroke-width: 6; stroke-linecap: round; stroke-linejoin: round; }}
.thick {{ stroke-width: 9; }}
.flush {{ mix-blend-mode: multiply; }}
.x {{ opacity: 0; transition: opacity .25s ease; }}
.eyes {{ opacity: 0; transition: opacity .2s; }}
.armLF, .armRF {{ opacity: 0; }}
.portal {{ fill: none; stroke: var(--accent); stroke-width: 10; filter: drop-shadow(0 0 14px var(--accent)); transform-origin: 50% 50%; }}
.fx text {{ font: 800 56px/1 "Inter", system-ui, sans-serif; fill: #c8d3f5; }}
.zzz text {{ fill: #a9b8e6; animation: zfloat 3s ease-in-out infinite; }} .zzz .z2 {{ animation-delay: .8s; }} .zzz .z3 {{ animation-delay: 1.6s; }}
.waves path {{ fill: none; stroke: var(--accent); stroke-width: 9; stroke-linecap: round; animation: wv 1.4s ease-out infinite; }} .waves .w2 {{ animation-delay: .35s; }}
.thought circle, .thought rect {{ fill: #e9eefc; stroke: #0b0806; stroke-width: 5; }} .thought .dots circle {{ fill: #5b4fc7; stroke: none; animation: dot 1.2s ease-in-out infinite; }}
.thought .dots circle:nth-child(2) {{ animation-delay: .2s; }} .thought .dots circle:nth-child(3) {{ animation-delay: .4s; }}
.bulb .rays path {{ stroke: #ffe066; stroke-width: 9; stroke-linecap: round; }} .bulb {{ transform-origin: 50% 100%; }}
.qmarks text {{ fill: var(--accent); font-size: 80px; animation: qm 1.8s ease-in-out infinite; }} .qmarks .q2 {{ animation-delay: .6s; }} .qmarks .q3 {{ animation-delay: 1.2s; }}
.sparkles path {{ fill: var(--accent); transform-origin: 50% 50%; animation: tw 1.2s ease-in-out infinite; filter: drop-shadow(0 0 8px var(--accent)); }} .sparkles .s2 {{ animation-delay: .4s; }} .sparkles .s3 {{ animation-delay: .8s; }}
.notes text {{ fill: var(--accent); font-size: 70px; animation: qm 1.6s ease-in-out infinite; }} .notes .n2 {{ animation-delay: .5s; }} .notes .n3 {{ animation-delay: 1s; }}
.steam path {{ fill: none; stroke: #e8eaf0; stroke-width: 10; stroke-linecap: round; animation: puff 1s ease-out infinite; }}
.bubbles rect, .bubbles path:not(.swap) {{ fill: #0f1a33; stroke: var(--accent); stroke-width: 5; }} .bubbles text {{ fill: #eafff6; font-size: 50px; text-anchor: middle; }}
.bubbles .swap {{ fill: none; stroke: var(--accent); stroke-width: 6; stroke-linecap: round; stroke-dasharray: 14 16; animation: dash 1.2s linear infinite; }}
.bubbles .bA, .bubbles .bB {{ transform-origin: 50% 100%; animation: bub 2.4s ease-in-out infinite; }} .bubbles .bB {{ animation-delay: 1.2s; }}
.dots3 rect {{ fill: #e9eefc; stroke: #0b0806; stroke-width: 5; }} .dots3 circle {{ fill: #444c66; animation: dot 1.4s ease-in-out infinite; }} .dots3 circle:nth-child(3) {{ animation-delay: .2s; }} .dots3 circle:nth-child(4) {{ animation-delay: .4s; }}
.burst path {{ stroke: var(--accent); stroke-width: 9; stroke-linecap: round; }}
.dust circle {{ fill: #c8cbd6; opacity: .8; }}
.bookt {{ font: 800 30px/1 Inter, system-ui, sans-serif; fill: #fbfbfb; text-anchor: middle; }}
.prop {{ transform-origin: 50% 50%; }}

/* ---------- transform origins (pivots) ---------- */
{"".join(f".{k} {{ transform-origin: {v}; }}" + chr(10) for k, v in origins.items())}
.glasses {{ transform-origin: 50% 50%; transition: transform .4s cubic-bezier(.3,1.3,.5,1); }}
.mOpen {{ transform-origin: 50% 0%; }}

/* ---------- always-on life ---------- */
.torso {{ animation: breathe 3.6s ease-in-out infinite; }}
.head {{ animation: bob 3.6s ease-in-out infinite; }}
.tail {{ animation: sway 3.2s ease-in-out infinite; }}
.armL {{ animation: armIdle 3.6s ease-in-out infinite; }} .armR {{ animation: armIdle 3.6s ease-in-out -1.8s infinite; }}

/* ---------- assistant states ---------- */
{S("sleeping", ".head")} {{ animation: none; transform: translateY(14px) rotate(9deg); }}
{S("sleeping", ".torso")} {{ animation-duration: 5.5s; }}
{S("sleeping", ".tail")} {{ animation: none; transform: rotate(12deg); }}
{S("sleeping", ".aura")} {{ opacity: .3; }}
{show("sleeping", "zzz")}

{S(["listening", "translating"], ".head")} {{ animation: none; transform: rotate(-6deg); }}
{S("listening", ".armL")} {{ opacity: 0; }}
{S("listening", ".armLF")} {{ opacity: 1; animation: none; transform: rotate(160deg); }}
{show("listening", "waves", "mcover", "mO")}

{S("thinking", ".head")} {{ animation: none; transform: rotate(5deg); }}
{S("thinking", ".armR")} {{ opacity: 0; }}
{S("thinking", ".armRF")} {{ opacity: 1; transform: rotate(124deg); }}
{show("thinking", "thought", "bRaise")}

{S("speaking", ".head")} {{ animation: nod 2.2s ease-in-out infinite; }}
{S("speaking", ".mOpen")} {{ animation: talk .34s ease-in-out infinite alternate; }}
:host([state="speaking"][data-live]) .mOpen {{ animation: none; transform: scaleY(var(--mouth)); }}
{S("speaking", ".armR")} {{ animation: gesture 2.6s ease-in-out infinite; }}
{show("speaking", "mcover", "mOpen")}

{S("working", ".head")} {{ animation: none; transform: translateY(6px) rotate(-3deg); }}
{S("working", ".armL")}, {S("working", ".armR")} {{ opacity: 0; }}
{show("working", "laptop")}
.typing .kL {{ animation: key .26s ease-in-out infinite alternate; transform-origin: 50% 100%; }} .typing .kR {{ animation: key .26s ease-in-out infinite alternate-reverse; transform-origin: 50% 100%; }}
.laptop .logo {{ animation: glow 1.4s ease-in-out infinite; }}

{S("success", ".rig")} {{ animation: hop 1.1s cubic-bezier(.3,.7,.4,1) infinite; }}
{S("success", ".armL")} {{ opacity: 0; }} {S("success", ".armR")} {{ opacity: 0; }}
{S("success", ".armLF")} {{ opacity: 1; transform: rotate(150deg); }} {S("success", ".armRF")} {{ opacity: 1; transform: rotate(-150deg); }}
{show("success", "mcover", "mSmile", "sparkles")}

{S("error", ".head")} {{ animation: shake .45s ease-in-out 3; }}
{S("error", ".glasses")} {{ transform: translateY(10px) rotate(-8deg); }}
{S("error", ".armL")} {{ opacity: 0; }} {S("error", ".armLF")} {{ opacity: 1; animation: scratch .5s ease-in-out infinite alternate; }}
{S("error", ".tail")} {{ animation: none; transform: rotate(20deg); }}
{show("error", "mcover", "mFrown", "bWorry", "sweat")}

{show("translating", "bubbles")}
{S("translating", ".head")} {{ animation: look 4s ease-in-out infinite; }}

/* ---------- Dex-style actions (original choreography) ---------- */
{S("walk", ".rig")} {{ animation: stepBob .6s ease-in-out infinite; }}
{S("walk", ".legL")} {{ animation: legSwing .6s ease-in-out infinite; }} {S("walk", ".legR")} {{ animation: legSwing .6s ease-in-out -.3s infinite; }}
{S("walk", ".armL")} {{ animation: armSwing .6s ease-in-out -.3s infinite; }} {S("walk", ".armR")} {{ animation: armSwing .6s ease-in-out infinite; }}
{S("walk", ".tail")} {{ animation-duration: 1.2s; }}

{S("coffee", ".armR")} {{ opacity: 0; }}
{S("coffee", ".armRF")} {{ opacity: 1; animation: sipArm 4s ease-in-out infinite; }}
{S("coffee", ".mug")} {{ opacity: 1; animation: sipMug 4s ease-in-out infinite; }}
{S("coffee", ".head")} {{ animation: sipHead 4s ease-in-out infinite; }}
.mug .steam {{ animation: puff 1.6s ease-out infinite; }}

{S("glasses", ".glasses")} {{ animation: glassesOff 6s ease-in-out infinite; }}
{S("glasses", ".eyes")} {{ animation: eyesShow 6s ease-in-out infinite; }}
{S("glasses", ".armL")}, {S("glasses", ".armR")} {{ opacity: 0; }}
{S("glasses", ".armLF")} {{ opacity: 1; animation: holdL 6s ease-in-out infinite; }} {S("glasses", ".armRF")} {{ opacity: 1; animation: holdR 6s ease-in-out infinite; }}
{S("glasses", ".cloth")} {{ animation: cloth 6s ease-in-out infinite; }}

{S("reading", ".armL")}, {S("reading", ".armR")} {{ opacity: 0; }}
{S("reading", ".armLF")} {{ opacity: 1; transform: rotate(-38deg); }} {S("reading", ".armRF")} {{ opacity: 1; transform: rotate(38deg); }}
{S("reading", ".head")} {{ animation: none; transform: translateY(8px) rotate(4deg); }}
{show("reading", "book")}
.book .page {{ transform-origin: 100% 50%; animation: flip 3s ease-in-out infinite; }}

{S("phone", ".armR")} {{ opacity: 0; }}
{S("phone", ".armRF")} {{ opacity: 1; transform: rotate(58deg); }}
{S("phone", ".phone")} {{ opacity: 1; transform: rotate(-58deg); }}
{S("phone", ".head")} {{ animation: none; transform: translateY(8px) rotate(5deg); }}
.phone .scroll {{ animation: scrollUp 1.4s linear infinite; }}

{S("clipboard", ".armL")}, {S("clipboard", ".armR")} {{ opacity: 0; }}
{S("clipboard", ".armLF")} {{ opacity: 1; transform: rotate(-48deg); }} {S("clipboard", ".clip")} {{ opacity: 1; transform: rotate(48deg); }}
{S("clipboard", ".armRF")} {{ opacity: 1; animation: penTap .5s ease-in-out infinite alternate; }} {S("clipboard", ".pen")} {{ opacity: 1; transform: rotate(-40deg); }}
{S("clipboard", ".head")} {{ animation: none; transform: translateY(6px) rotate(-4deg); }}
.clip .tick {{ animation: glow 1s ease-in-out infinite; }}

{S("idea", ".armR")} {{ opacity: 0; }}
{S("idea", ".armRF")} {{ opacity: 1; animation: pointUp 1s ease-in-out infinite alternate; }}
{S("idea", ".bulb")} {{ opacity: 1; animation: pop .6s cubic-bezier(.3,1.6,.5,1) both; }}
.bulb .rays {{ animation: glow .9s ease-in-out infinite; }}
{show("idea", "bRaise", "mcover", "mSmile")}

{S("confused", ".head")} {{ animation: tilt 2.4s ease-in-out infinite; }}
{S("confused", ".armL")} {{ opacity: 0; }} {S("confused", ".armLF")} {{ opacity: 1; animation: scratch .5s ease-in-out infinite alternate; }}
{show("confused", "qmarks", "bRaise", "mcover", "mFlat")}

{S("sad", ".head")} {{ animation: none; transform: translateY(16px) rotate(-6deg); }}
{S("sad", ".rig")} {{ transform: scaleY(.97); }}
{S("sad", ".tail")} {{ animation: none; transform: rotate(28deg); }}
{S("sad", ".armL")} {{ animation: none; transform: rotate(-6deg); }} {S("sad", ".armR")} {{ animation: none; transform: rotate(6deg); }}
{show("sad", "bWorry", "mcover", "mFrown", "tear")}
:host([state="sad"]) .tear {{ animation: drip 2s ease-in infinite; }}

{S("angry", ".rig")} {{ animation: stomp .5s ease-in-out infinite; }}
{S("angry", ".flush")} {{ animation: flush 1.2s ease-in-out infinite; }}
{S("angry", ".armL")} {{ animation: none; transform: rotate(12deg); }} {S("angry", ".armR")} {{ animation: none; transform: rotate(-12deg); }}
{show("angry", "bAngry", "mcover", "mFlat", "steam")}

{S("thumbsup", ".armR")} {{ opacity: 0; }}
{S("thumbsup", ".armRF")} {{ opacity: 1; animation: thumbArm 1.6s cubic-bezier(.3,1.4,.5,1) infinite alternate; }}
{S("thumbsup", ".thumb")} {{ opacity: 1; animation: thumbProp 1.6s cubic-bezier(.3,1.4,.5,1) infinite alternate; }}
{show("thumbsup", "mcover", "mSmile")}

{S("waiting", ".armL")} {{ opacity: 0; }}
{S("waiting", ".armLF")} {{ opacity: 1; transform: rotate(-72deg); }} {S("waiting", ".watch")} {{ opacity: 1; transform: rotate(72deg); }}
{S("waiting", ".legR")} {{ animation: tap .4s ease-in-out infinite alternate; }}
{S("waiting", ".head")} {{ animation: checkWatch 4s ease-in-out infinite; }}
.watch .hand {{ transform-origin: 50% 100%; animation: spin 2s linear infinite; }}
{show("waiting", "dots3", "mcover", "mFlat")}

{S("dance", ".rig")} {{ animation: groove .8s ease-in-out infinite; }}
{S("dance", ".armL")}, {S("dance", ".armR")} {{ opacity: 0; }}
{S("dance", ".armLF")} {{ opacity: 1; animation: danceL .8s ease-in-out infinite; }} {S("dance", ".armRF")} {{ opacity: 1; animation: danceR .8s ease-in-out infinite; }}
{S("dance", ".legL")} {{ animation: kick .8s ease-in-out infinite; }} {S("dance", ".legR")} {{ animation: kick .8s ease-in-out -.4s infinite; }}
{show("dance", "notes", "mcover", "mSmile")}

{S("celebrate", ".rig")} {{ animation: bigJump 1.6s cubic-bezier(.3,.7,.4,1) infinite; }}
{S("celebrate", ".armL")}, {S("celebrate", ".armR")} {{ opacity: 0; }}
{S("celebrate", ".armLF")} {{ opacity: 1; animation: spreadL 1.6s ease-in-out infinite; }} {S("celebrate", ".armRF")} {{ opacity: 1; animation: spreadR 1.6s ease-in-out infinite; }}
{show("celebrate", "burst", "mcover", "mSmile", "sparkles")}

{S("sixseven", ".armL")}, {S("sixseven", ".armR")} {{ opacity: 0; }}
{S("sixseven", ".armLF")} {{ opacity: 1; animation: scaleL .7s ease-in-out infinite; }} {S("sixseven", ".armRF")} {{ opacity: 1; animation: scaleR .7s ease-in-out infinite; }}
{S("sixseven", ".head")} {{ animation: bounceHead .35s ease-in-out infinite alternate; }}
{show("sixseven", "mcover", "mO")}

{S("wave", ".armR")} {{ opacity: 0; }}
{S("wave", ".armRF")} {{ opacity: 1; animation: waveArm .5s ease-in-out infinite alternate; }}
{show("wave", "mcover", "mSmile")}

{S("portal-in", ".rig")} {{ animation: sink 3s ease-in infinite; }}
{S("portal-in", ".portal")} {{ opacity: 1; animation: portal 3s ease-in-out infinite; }}
{S("portal-out", ".rig")} {{ animation: rise 3s ease-out infinite; }}
{S("portal-out", ".portal")} {{ opacity: 1; animation: portal 3s ease-in-out infinite reverse; }}
{S("fall", ".rig")} {{ animation: drop 2.6s cubic-bezier(.5,0,.75,0) infinite; }}
{S("fall", ".dust")} {{ animation: dust 2.6s ease-out infinite; }}
{S("entrance", ".rig")} {{ animation: hero 2.8s cubic-bezier(.3,1.5,.5,1) infinite; }}
{S("entrance", ".sparkles")} {{ animation: heroFx 2.8s ease-out infinite; }}

/* ---------- keyframes ---------- */
@keyframes breathe {{ 50% {{ transform: scaleY(1.012); }} }}
@keyframes bob {{ 50% {{ transform: translateY(-3px) rotate(.6deg); }} }}
@keyframes sway {{ 0%, 100% {{ transform: rotate(-4deg); }} 50% {{ transform: rotate(6deg); }} }}
@keyframes armIdle {{ 0%, 100% {{ transform: rotate(1.2deg); }} 50% {{ transform: rotate(-1.2deg); }} }}
@keyframes zfloat {{ 0% {{ opacity: 0; transform: translate(0, 20px); }} 30% {{ opacity: 1; }} 100% {{ opacity: 0; transform: translate(26px, -36px); }} }}
@keyframes wv {{ 0% {{ opacity: 0; }} 30% {{ opacity: 1; }} 100% {{ opacity: 0; }} }}
@keyframes dot {{ 0%, 100% {{ transform: translateY(0); opacity: .5; }} 50% {{ transform: translateY(-10px); opacity: 1; }} }}
@keyframes talk {{ from {{ transform: scaleY(.2); }} to {{ transform: scaleY(1); }} }}
@keyframes nod {{ 0%, 100% {{ transform: rotate(0); }} 30% {{ transform: rotate(2deg) translateY(-2px); }} 70% {{ transform: rotate(-2deg); }} }}
@keyframes gesture {{ 0%, 100% {{ transform: rotate(0); }} 40% {{ transform: rotate(-28deg); }} 60% {{ transform: rotate(-18deg); }} }}
@keyframes key {{ from {{ transform: translateY(0); }} to {{ transform: translateY(-12px); }} }}
@keyframes glow {{ 50% {{ opacity: .4; }} }}
@keyframes hop {{ 0%, 100% {{ transform: translateY(0) scale(1, 1); }} 12% {{ transform: scale(1.03, .96); }} 40% {{ transform: translateY(-46px) scale(.98, 1.02); }} 70% {{ transform: translateY(0) scale(1.03, .97); }} }}
@keyframes tw {{ 0%, 100% {{ transform: scale(.4) rotate(0); opacity: .3; }} 50% {{ transform: scale(1.1) rotate(25deg); opacity: 1; }} }}
@keyframes shake {{ 0%, 100% {{ transform: translateX(0); }} 25% {{ transform: translateX(-10px) rotate(-2deg); }} 75% {{ transform: translateX(10px) rotate(2deg); }} }}
@keyframes scratch {{ from {{ transform: rotate(168deg); }} to {{ transform: rotate(178deg); }} }}
@keyframes look {{ 0%, 100% {{ transform: rotate(-5deg); }} 50% {{ transform: rotate(5deg); }} }}
@keyframes bub {{ 0%, 100% {{ transform: scale(.85); opacity: .55; }} 50% {{ transform: scale(1.06); opacity: 1; }} }}
@keyframes dash {{ to {{ stroke-dashoffset: -60; }} }}
@keyframes qm {{ 0% {{ opacity: 0; transform: translateY(16px); }} 30% {{ opacity: 1; }} 100% {{ opacity: 0; transform: translateY(-30px); }} }}
@keyframes puff {{ 0% {{ opacity: 0; transform: translateY(10px); }} 40% {{ opacity: 1; }} 100% {{ opacity: 0; transform: translateY(-30px); }} }}
@keyframes drip {{ 0% {{ transform: translateY(-6px); opacity: 0; }} 20% {{ opacity: 1; }} 100% {{ transform: translateY(30px); opacity: 0; }} }}
@keyframes stepBob {{ 0%, 50%, 100% {{ transform: translateY(0); }} 25%, 75% {{ transform: translateY(-12px); }} }}
@keyframes legSwing {{ 0%, 100% {{ transform: rotate(12deg); }} 50% {{ transform: rotate(-12deg); }} }}
@keyframes armSwing {{ 0%, 100% {{ transform: rotate(14deg); }} 50% {{ transform: rotate(-14deg); }} }}
@keyframes sipArm {{ 0%, 25% {{ transform: rotate(92deg); }} 40%, 62% {{ transform: rotate(132deg); }} 78%, 100% {{ transform: rotate(92deg); }} }}
@keyframes sipMug {{ 0%, 25% {{ transform: rotate(-92deg); }} 40%, 62% {{ transform: rotate(-112deg); }} 78%, 100% {{ transform: rotate(-92deg); }} }}
@keyframes sipHead {{ 0%, 25%, 78%, 100% {{ transform: rotate(0); }} 40%, 62% {{ transform: rotate(-5deg) translateY(-2px); }} }}
@keyframes glassesOff {{ 0%, 12% {{ transform: translate(0, 0); }} 26%, 74% {{ transform: translate(0, 318px) scale(.92); }} 88%, 100% {{ transform: translate(0, 0); }} }}
@keyframes eyesShow {{ 0%, 16% {{ opacity: 0; }} 22%, 80% {{ opacity: 1; }} 84%, 100% {{ opacity: 0; }} }}
@keyframes holdL {{ 0%, 10% {{ transform: rotate(0); }} 16% {{ transform: rotate(150deg); }} 26%, 74% {{ transform: rotate(-36deg); }} 82% {{ transform: rotate(150deg); }} 92%, 100% {{ transform: rotate(0); }} }}
@keyframes holdR {{ 0%, 10% {{ transform: rotate(0); }} 16% {{ transform: rotate(-150deg); }} 26%, 74% {{ transform: rotate(36deg); }} 82% {{ transform: rotate(-150deg); }} 92%, 100% {{ transform: rotate(0); }} }}
@keyframes cloth {{ 0%, 26% {{ opacity: 0; transform: translateX(0); }} 30% {{ opacity: 1; transform: translateX(-40px); }} 38% {{ transform: translateX(40px); }} 46% {{ transform: translateX(-40px); }} 54% {{ transform: translateX(40px); }} 62% {{ transform: translateX(-40px); }} 70% {{ opacity: 1; transform: translateX(40px); }} 74%, 100% {{ opacity: 0; }} }}
@keyframes flip {{ 0%, 70% {{ transform: scaleX(1); }} 85% {{ transform: scaleX(-1); }} 100% {{ transform: scaleX(-1); opacity: 0; }} }}
@keyframes scrollUp {{ from {{ transform: translateY(0); }} to {{ transform: translateY(-12px); }} }}
@keyframes penTap {{ from {{ transform: rotate(40deg); }} to {{ transform: rotate(48deg); }} }}
@keyframes pointUp {{ from {{ transform: rotate(-160deg); }} to {{ transform: rotate(-170deg); }} }}
@keyframes pop {{ from {{ transform: scale(0); }} to {{ transform: scale(1); }} }}
@keyframes tilt {{ 0%, 100% {{ transform: rotate(-7deg); }} 50% {{ transform: rotate(7deg); }} }}
@keyframes stomp {{ 0%, 100% {{ transform: translateY(0); }} 50% {{ transform: translateY(-8px) rotate(1deg); }} }}
@keyframes flush {{ 0%, 100% {{ opacity: .18; }} 50% {{ opacity: .34; }} }}
@keyframes thumbArm {{ from {{ transform: rotate(-92deg); }} to {{ transform: rotate(-112deg); }} }}
@keyframes thumbProp {{ from {{ transform: rotate(92deg); }} to {{ transform: rotate(112deg); }} }}
@keyframes tap {{ from {{ transform: rotate(0); }} to {{ transform: rotate(-9deg); }} }}
@keyframes checkWatch {{ 0%, 40%, 100% {{ transform: rotate(0); }} 55%, 80% {{ transform: rotate(-8deg) translateY(6px); }} }}
@keyframes spin {{ to {{ transform: rotate(360deg); }} }}
@keyframes groove {{ 0%, 100% {{ transform: translateY(0) rotate(-5deg); }} 25% {{ transform: translateY(-16px) rotate(0); }} 50% {{ transform: translateY(0) rotate(5deg); }} 75% {{ transform: translateY(-16px) rotate(0); }} }}
@keyframes danceL {{ 0%, 100% {{ transform: rotate(150deg); }} 50% {{ transform: rotate(40deg); }} }}
@keyframes danceR {{ 0%, 100% {{ transform: rotate(-40deg); }} 50% {{ transform: rotate(-150deg); }} }}
@keyframes kick {{ 0%, 100% {{ transform: rotate(0); }} 50% {{ transform: rotate(-14deg); }} }}
@keyframes bigJump {{ 0%, 100% {{ transform: translateY(0) scale(1, 1); }} 15% {{ transform: scale(1.05, .93); }} 45% {{ transform: translateY(-120px) scale(.97, 1.04); }} 75% {{ transform: translateY(0) scale(1.06, .94); }} 85% {{ transform: scale(1, 1); }} }}
@keyframes spreadL {{ 0%, 15%, 85%, 100% {{ transform: rotate(20deg); }} 40%, 70% {{ transform: rotate(120deg); }} }}
@keyframes spreadR {{ 0%, 15%, 85%, 100% {{ transform: rotate(-20deg); }} 40%, 70% {{ transform: rotate(-120deg); }} }}
@keyframes scaleL {{ 0%, 100% {{ transform: rotate(-64deg) translateY(-14px); }} 50% {{ transform: rotate(-44deg) translateY(14px); }} }}
@keyframes scaleR {{ 0%, 100% {{ transform: rotate(44deg) translateY(14px); }} 50% {{ transform: rotate(64deg) translateY(-14px); }} }}
@keyframes bounceHead {{ from {{ transform: translateY(0); }} to {{ transform: translateY(-8px); }} }}
@keyframes waveArm {{ from {{ transform: rotate(-150deg); }} to {{ transform: rotate(-118deg); }} }}
@keyframes sink {{ 0%, 20% {{ transform: translateY(0); }} 75%, 100% {{ transform: translateY(860px); }} }}
@keyframes rise {{ 0%, 25% {{ transform: translateY(860px); }} 80%, 100% {{ transform: translateY(0); }} }}
@keyframes portal {{ 0% {{ transform: scale(0, 0); }} 15% {{ transform: scale(1, 1); }} 80% {{ transform: scale(1, 1); }} 100% {{ transform: scale(0, 0); }} }}
@keyframes drop {{ 0% {{ transform: translateY(-900px) rotate(-8deg); }} 45% {{ transform: translateY(0) rotate(0); }} 52% {{ transform: scale(1.08, .88); }} 62%, 100% {{ transform: scale(1, 1); }} }}
@keyframes dust {{ 0%, 44% {{ opacity: 0; transform: scale(.4); }} 52% {{ opacity: .9; transform: scale(1); }} 75%, 100% {{ opacity: 0; transform: scale(1.5); }} }}
@keyframes hero {{ 0% {{ transform: scale(0) rotate(-20deg); }} 35% {{ transform: scale(1) rotate(0); }} 100% {{ transform: scale(1); }} }}
@keyframes heroFx {{ 0%, 25% {{ opacity: 0; }} 40% {{ opacity: 1; }} 70%, 100% {{ opacity: 0; }} }}

@media (prefers-reduced-motion: reduce) {{ *, *::before, *::after {{ animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }} }}
'''

DURATION = {"coffee": 8000, "glasses": 12000, "reading": 9000, "phone": 8000, "clipboard": 6000, "waiting": 8000,
            "dance": 6400, "idea": 3000, "wave": 2500, "thumbsup": 3200, "celebrate": 3200, "sixseven": 4200, "walk": 4800}

TS = f'''/**
 * <nour-nx> — Nour's character: the user's own Nx monkey design, traced 1:1 from their image,
 * split into parts (head, arms, legs, tail, sunglasses) and animated.
 *
 *   <nour-nx state="idle" autoplay></nour-nx>
 *   el.state = "listening";     // an assistant state or a fun action (see NX_STATES / NX_ACTIONS)
 *   el.level = 0.6;             // live voice loudness 0..1 while speaking (drives the mouth)
 *   el.play("coffee");          // play a fun action once, then go back to the previous state
 *
 * With the `autoplay` attribute, an idle Nour does something by itself now and then
 * (coffee, phone, reading, cleaning its glasses…), like a little desktop companion.
 */

export const NX_STATES = {json.dumps(STATES)} as const;
export const NX_ACTIONS = {json.dumps(ACTIONS)} as const;
export type NxState = (typeof NX_STATES)[number] | (typeof NX_ACTIONS)[number];

const ACCENT: Record<string, string> = {json.dumps(ACCENT)};
const DURATION: Record<string, number> = {json.dumps(DURATION)};
const IDLE_FUN = ["coffee", "glasses", "phone", "reading", "waiting", "wave", "idea", "dance"];

const SVG = `{SVG}`;

const CSS = `{CSS}`;

export class NourNx extends HTMLElement {{
  static get observedAttributes() {{ return ["state", "autoplay"]; }}
  private root: ShadowRoot;
  private liveTimer = 0;
  private funTimer = 0;
  private playTimer = 0;

  constructor() {{
    super();
    this.root = this.attachShadow({{ mode: "open" }});
    this.root.innerHTML = `<style>${{CSS}}</style>${{SVG}}`;
  }}

  get state(): NxState {{ return (this.getAttribute("state") as NxState) || "idle"; }}
  set state(s: NxState) {{ clearTimeout(this.playTimer); this.setAttribute("state", s); }}

  /** Live loudness of Nour's voice (0..1): drives the mouth while speaking. */
  set level(v: number) {{
    const l = Math.max(0, Math.min(1, v || 0));
    this.style.setProperty("--mouth", String(0.15 + l * 0.95));
    this.setAttribute("data-live", "");
    clearTimeout(this.liveTimer);
    this.liveTimer = window.setTimeout(() => this.removeAttribute("data-live"), 250);
  }}

  /** Play a fun action once, then return to the state Nour was in. */
  play(action: NxState, ms = DURATION[action] ?? 4000) {{
    const back = this.state;
    clearTimeout(this.playTimer);
    this.setAttribute("state", action);
    this.playTimer = window.setTimeout(() => this.setAttribute("state", back === action ? "idle" : back), ms);
  }}

  connectedCallback() {{
    if (!this.hasAttribute("state")) this.setAttribute("state", "idle");
    this.applyAccent(); this.scheduleFun();
  }}
  disconnectedCallback() {{ clearTimeout(this.funTimer); clearTimeout(this.playTimer); clearTimeout(this.liveTimer); }}
  attributeChangedCallback() {{ this.applyAccent(); }}

  private applyAccent() {{ this.style.setProperty("--accent", ACCENT[this.state] || "#46d7ff"); }}

  private scheduleFun() {{
    clearTimeout(this.funTimer);
    this.funTimer = window.setTimeout(() => {{
      if (this.hasAttribute("autoplay") && this.state === "idle") this.play(IDLE_FUN[Math.floor(Math.random() * IDLE_FUN.length)] as NxState);
      this.scheduleFun();
    }}, 18000 + Math.random() * 22000);
  }}
}}

if (!customElements.get("nour-nx")) customElements.define("nour-nx", NourNx);
'''
open(out_path, "w").write(TS)
print("written", len(TS) // 1024, "KB")
