"""Vector arms with elbows for the Nx monkey, plus pose keyframes solved with 2-link IK."""
import math

W = 66                       # arm thickness (brown)
INK, WHITE = 7, 7            # outline widths (each side)
ARMS = {  # shoulder, elbow, hand centre (rest pose, full-image coords)
    "L": {"S": (458, 800), "E": (455, 860), "H": (455, 922), "out": -1},
    "R": {"S": (760, 800), "E": (762, 860), "H": (762, 922), "out": 1},
}

def _hand(H, side):
    x, y = H
    # mitten hand with two finger creases, light wrist tuft
    s = -1 if side == "L" else 1
    return (f'<path class="cuff" d="M{x-30} {y-28} l8 10 8 -10 7 10 7 -10 7 10 7 -10 7 10 8 -10 l-2 14 h-56 z"/>'
            f'<ellipse class="hand" cx="{x}" cy="{y}" rx="33" ry="30"/>'
            f'<path class="crease" d="M{x-8} {y+8} v14 M{x+8} {y+8} v14 M{x + s*22} {y-6} q{s*6} 10 {-s*2} 18"/>')

def arm_markup(side, cls, props="", sleeve=False, traced=None):
    a = ARMS[side]; S, E, H = a["S"], a["E"], a["H"]
    seg_up = f"M{S[0]} {S[1]} L{E[0]} {E[1]}"; seg_fo = f"M{E[0]} {E[1]} L{(E[0]+H[0])//2} {H[1]-24}"
    def capsule(d):
        return (f'<path class="aw" d="{d}"/><path class="ak" d="{d}"/><path class="ab" d="{d}"/>')
    sl = ""
    bbU = f'<rect class="bb" x="{S[0]-420}" y="{S[1]-420}" width="840" height="840"/>'
    bbF = f'<rect class="bb" x="{E[0]-200}" y="{E[1]-200}" width="400" height="400"/>'
    if traced is not None:
        return f'<g class="{cls} arm{side}">{bbU}{traced}</g>'
    ol = lambda d: f'<path class="aw" d="{d}"/><path class="ak" d="{d}"/>'
    fill = lambda d: f'<path class="ab" d="{d}"/>'
    return (f'<g class="{cls} arm{side}">{bbU}{ol(seg_up)}'
            f'<g class="fore">{bbF}{ol(seg_fo)}</g>{fill(seg_up)}'
            f'<g class="fore">{bbF}{fill(seg_fo)}{_hand(H, side)}{props}</g>{sl}</g>')

ARM_CSS = f'''
.aw {{ fill: none; stroke: #fbfbfb; stroke-width: {W + 2*INK + 2*WHITE}px; stroke-linecap: round; }}
.ak {{ fill: none; stroke: #0b0806; stroke-width: {W + 2*INK}px; stroke-linecap: round; }}
.ab {{ fill: none; stroke: var(--fur); stroke-width: {W}px; stroke-linecap: round; }}
.hand {{ fill: var(--face); stroke: #0b0806; stroke-width: 6; paint-order: stroke; }}
.cuff {{ fill: var(--face-d); stroke: #0b0806; stroke-width: 4; stroke-linejoin: round; }}
.crease {{ fill: none; stroke: #0b0806; stroke-width: 4; stroke-linecap: round; }}
.sleeve {{ fill: #0b0806; stroke: #fbfbfb; stroke-width: 6; }}
.armL, .armR, .armLF, .armRF {{ transform-origin: 50% 50%; }}
.fore {{ transform-origin: 50% 50%; }}
.joint {{ fill: var(--fur); }}
.armLF, .armRF {{ opacity: 0; }}
.armLF .aw, .armRF .aw {{ stroke: #0b0806; }}
.teL, .teR {{ opacity: 0; fill: none; stroke: #fbfbfb; stroke-width: 6; stroke-linecap: round; }}
'''

def _ang(p, q): return math.degrees(math.atan2(q[1] - p[1], q[0] - p[0]))

def ik(side, T):
    """Rotation of the upper arm (about the shoulder) and the forearm (about the elbow, relative)."""
    a = ARMS[side]; S, E, H = a["S"], a["E"], a["H"]
    L1 = math.dist(S, E); L2 = math.dist(E, H)
    d = min(math.dist(S, T), L1 + L2 - 0.5); d = max(d, abs(L1 - L2) + 0.5)
    base = math.atan2(T[1] - S[1], T[0] - S[0])
    alpha = math.acos(max(-1, min(1, (L1*L1 + d*d - L2*L2) / (2 * L1 * d))))
    best = None
    for sgn in (1, -1):
        p1 = base + sgn * alpha
        Ex = (S[0] + L1 * math.cos(p1), S[1] + L1 * math.sin(p1))
        Tx = (S[0] + d * math.cos(base), S[1] + d * math.sin(base))
        score = (Ex[0] - 611) * a["out"]          # prefer elbow pointing away from the body
        if best is None or score > best[0]: best = (score, p1, Ex, Tx)
    _, p1, Ex, Tx = best
    p2 = math.atan2(Tx[1] - Ex[1], Tx[0] - Ex[0])
    up = math.degrees(p1) - _ang(S, E)
    fo = (math.degrees(p2) - _ang(E, H)) - up
    norm = lambda v: (v + 180) % 360 - 180
    return round(norm(up), 1), round(norm(fo), 1)

def pose_css(sel_host, side, frames, dur=None, timing="ease-in-out", direction="normal", prop=None, prop_extra=None, name=None):
    """frames: list of (percent, (x, y)) or a single (x, y). Emits rules for the front arm + optional prop."""
    cls = ".armLF" if side == "L" else ".armRF"; back = ".armL" if side == "L" else ".armR"
    out = [f"{sel_host} {back} {{ opacity: 0; }}", f"{sel_host} {cls} {{ opacity: 1; }}", f"{sel_host} .te{side} {{ opacity: 1; }}"]
    if isinstance(frames, tuple):
        up, fo = ik(side, frames)
        out.append(f"{sel_host} {cls} {{ transform: rotate({up}deg); }}")
        out.append(f"{sel_host} {cls} .fore {{ transform: rotate({fo}deg); }}")
        if prop: out.append(f"{sel_host} {prop} {{ opacity: 1; transform: rotate({-(up + fo) + (prop_extra or 0)}deg); }}")
        return "\n".join(out)
    kU, kF, kP = [], [], []
    for pct, T in frames:
        up, fo = ik(side, T)
        extra = prop_extra.get(pct, 0) if isinstance(prop_extra, dict) else 0
        kU.append(f"{pct}% {{ transform: rotate({up}deg); }}"); kF.append(f"{pct}% {{ transform: rotate({fo}deg); }}")
        kP.append(f"{pct}% {{ transform: rotate({-(up + fo) + extra}deg); }}")
    n = name
    out.append(f"{sel_host} {cls} {{ animation: {n}U {dur} {timing} infinite {direction}; }}")
    out.append(f"{sel_host} {cls} .fore {{ animation: {n}F {dur} {timing} infinite {direction}; }}")
    out.append(f"@keyframes {n}U {{ {' '.join(kU)} }}"); out.append(f"@keyframes {n}F {{ {' '.join(kF)} }}")
    if prop:
        out.append(f"{sel_host} {prop} {{ opacity: 1; animation: {n}P {dur} {timing} infinite {direction}; }}")
        out.append(f"@keyframes {n}P {{ {' '.join(kP)} }}")
    return "\n".join(out)

def H(state): return f':host([state="{state}"])'

def all_pose_css():
    L, R = "L", "R"
    css = []
    add = css.append
    # rest-arm idle sway (back arms)

    # assistant states
    add(pose_css(H("listening"), L, (414, 650)))
    add(pose_css(H("thinking"), R, (655, 712)))
    add(pose_css(H("speaking"), R, [(0, (800, 900)), (35, (850, 840)), (60, (830, 870)), (100, (800, 900))], "2.6s", name="spk"))
    add(pose_css(H("working"), L, [(0, (532, 905)), (100, (532, 893))], ".26s", direction="alternate", name="wkL"))
    add(pose_css(H("working"), R, [(0, (690, 893)), (100, (690, 905))], ".26s", direction="alternate", name="wkR"))
    add(pose_css(H("success"), L, (372, 700))); add(pose_css(H("success"), R, (848, 700)))
    add(pose_css(H("error"), L, [(0, (430, 660)), (100, (446, 672))], ".45s", direction="alternate", name="errL"))
    # actions
    add(f'{H("walk")} .armL, {H("walk")} .armR {{ opacity: 0; }} {H("walk")} .armLF, {H("walk")} .armRF, {H("walk")} .teL, {H("walk")} .teR {{ opacity: 1; }}')
    add(f'{H("walk")} .armLF {{ animation: swingL .6s ease-in-out infinite; }} {H("walk")} .armRF {{ animation: swingR .6s ease-in-out infinite; }}')
    add(f'{H("walk")} .armLF .fore {{ animation: swingF .6s ease-in-out infinite; }} {H("walk")} .armRF .fore {{ animation: swingF .6s ease-in-out -.3s infinite; }}')
    add("@keyframes swingL { 0%, 100% { transform: rotate(-16deg); } 50% { transform: rotate(16deg); } }")
    add("@keyframes swingR { 0%, 100% { transform: rotate(-16deg); } 50% { transform: rotate(16deg); } }")
    add("@keyframes swingF { 0%, 100% { transform: rotate(-8deg); } 50% { transform: rotate(12deg); } }")
    add(pose_css(H("coffee"), R, [(0, (702, 860)), (28, (702, 860)), (45, (676, 712)), (64, (676, 712)), (80, (702, 860)), (100, (702, 860))],
                 "4s", prop=".mug", prop_extra={45: -18, 64: -18}, name="sip"))
    add(pose_css(H("glasses"), L, [(0, (455, 922)), (10, (455, 922)), (17, (520, 690)), (26, (556, 885)), (74, (556, 885)), (83, (520, 690)), (92, (455, 922)), (100, (455, 922))], "6s", name="glL"))
    add(pose_css(H("glasses"), R, [(0, (762, 922)), (10, (762, 922)), (17, (700, 690)), (26, (666, 885)), (74, (666, 885)), (83, (700, 690)), (92, (762, 922)), (100, (762, 922))], "6s", name="glR"))
    add(pose_css(H("reading"), L, (528, 888))); add(pose_css(H("reading"), R, (694, 888)))
    add(pose_css(H("phone"), R, (690, 850), prop=".phone"))
    add(pose_css(H("clipboard"), L, (532, 878), prop=".clip"))
    add(pose_css(H("clipboard"), R, [(0, (650, 882)), (100, (660, 900))], ".5s", direction="alternate", prop=".pen", prop_extra={0: -35, 100: -35}, name="pen"))
    add(pose_css(H("idea"), R, [(0, (806, 692)), (100, (816, 702))], "1s", direction="alternate", name="idea"))
    add(pose_css(H("confused"), L, [(0, (430, 660)), (100, (446, 672))], ".5s", direction="alternate", name="cfL"))
    add(pose_css(H("angry"), L, (418, 880))); add(pose_css(H("angry"), R, (800, 880)))
    add(pose_css(H("thumbsup"), R, [(0, (858, 800)), (100, (866, 772))], "1.6s", timing="cubic-bezier(.3,1.4,.5,1)", direction="alternate", prop=".thumb", name="thb"))
    add(pose_css(H("waiting"), L, (560, 848), prop=".watch", prop_extra=0))
    add(pose_css(H("dance"), L, [(0, (372, 700)), (50, (400, 900)), (100, (372, 700))], ".8s", name="dnL"))
    add(pose_css(H("dance"), R, [(0, (820, 900)), (50, (848, 700)), (100, (820, 900))], ".8s", name="dnR"))
    add(pose_css(H("celebrate"), L, [(0, (400, 880)), (15, (400, 880)), (40, (360, 720)), (70, (360, 720)), (85, (400, 880)), (100, (400, 880))], "1.6s", name="ceL"))
    add(pose_css(H("celebrate"), R, [(0, (820, 880)), (15, (820, 880)), (40, (862, 720)), (70, (862, 720)), (85, (820, 880)), (100, (820, 880))], "1.6s", name="ceR"))
    add(pose_css(H("sixseven"), L, [(0, (532, 830)), (50, (532, 890)), (100, (532, 830))], ".7s", name="ssL"))
    add(pose_css(H("sixseven"), R, [(0, (690, 890)), (50, (690, 830)), (100, (690, 890))], ".7s", name="ssR"))
    add(pose_css(H("wave"), R, [(0, (846, 700)), (100, (872, 744))], ".45s", direction="alternate", name="wav"))
    return "\n".join(css)

if __name__ == "__main__":
    for s, T in [("R", (762, 922)), ("R", (676, 712)), ("L", (414, 650)), ("R", (848, 700))]:
        print(s, T, ik(s, T))
