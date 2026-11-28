// Frame-by-frame pose definitions for the Nx monkey sprite sheets.
// Runs inside the renderer page: poseFrame(seq, i) poses the rig for frame i, then the frame is captured.
// Motion principles used: ease-in/out, overlapping action (tail and head lag the body),
// squash & stretch on contacts, anticipation before jumps, secondary motion on effects.

const TAU = Math.PI * 2;
const sin = Math.sin, cos = Math.cos, abs = Math.abs, max = Math.max, min = Math.min;
const lerp = (a, b, k) => a + (b - a) * k;
const lerp2 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
const smooth = k => k * k * (3 - 2 * k);
const clamp01 = k => max(0, min(1, k));
const seg = (t, a, b) => smooth(clamp01((t - a) / (b - a)));   // eased 0→1 between a and b

// ---- arm IK (same geometry as scripts/character/arms.py)
const ARMS = { L: { S: [458, 800], E: [455, 860], H: [455, 922], out: -1 }, R: { S: [760, 800], E: [762, 860], H: [762, 922], out: 1 } };
const deg = r => r * 180 / Math.PI, ang = (p, q) => deg(Math.atan2(q[1] - p[1], q[0] - p[0]));
const norm = v => ((v + 180) % 360 + 360) % 360 - 180;
function ik(side, T) {
  const a = ARMS[side], S = a.S, E = a.E, H = a.H;
  const L1 = Math.hypot(E[0] - S[0], E[1] - S[1]), L2 = Math.hypot(H[0] - E[0], H[1] - E[1]);
  let d = Math.hypot(T[0] - S[0], T[1] - S[1]); d = min(d, L1 + L2 - 0.5); d = max(d, abs(L1 - L2) + 0.5);
  const base = Math.atan2(T[1] - S[1], T[0] - S[0]);
  const alpha = Math.acos(max(-1, min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  let best = null;
  for (const sg of [1, -1]) {
    const p1 = base + sg * alpha, Ex = [S[0] + L1 * cos(p1), S[1] + L1 * sin(p1)], Tx = [S[0] + d * cos(base), S[1] + d * sin(base)];
    const score = (Ex[0] - 611) * a.out;
    if (!best || score > best.score) best = { score, p1, Ex, Tx };
  }
  const p2 = Math.atan2(best.Tx[1] - best.Ex[1], best.Tx[0] - best.Ex[0]);
  const up = deg(best.p1) - ang(S, E), fo = (deg(p2) - ang(E, H)) - up;
  return { up: norm(up), fo: norm(fo) };
}

// ---- pulses for effects
const pulse = (t, w = 0.5) => { const x = ((t % 1) + 1) % 1; return x < w ? sin(Math.PI * x / w) : 0; };

// Each sequence: frames, fps, loop, and pose(t) with t in [0, 1).
// pose fields: rig {x,y,r,sx,sy}, torso {sy,r}, head {x,y,r}, tail {r}, legL/legR {r},
//   backL/backR {r} (original arms) or armL/armR {target:[x,y]} | {up,fo} (bendable arms),
//   glasses {x,y,r}, show [...face/fx classes], fx {selector: {o, x, y, s, r}}
const SEQ = {
  idle: { frames: 48, fps: 20, loop: true, pose(t) {
    const p = t * TAU;
    return { rig: { x: 1.5 * sin(p) }, torso: { sy: 1 + 0.012 * sin(p) }, head: { y: -3 * sin(p - 0.5), r: 1.2 * sin(p - 0.9) },
      tail: { r: 5 * sin(p - 1.2) }, backL: { r: 1.0 * sin(p - 0.6) }, backR: { r: -1.0 * sin(p - 0.6) } };
  } },

  listening: { frames: 32, fps: 20, loop: true, pose(t) {
    const p = t * TAU;
    return { torso: { sy: 1 + 0.01 * sin(p) }, head: { r: -6 + 1.5 * sin(p), y: -1.2 * sin(2 * p) }, tail: { r: 7 * sin(2 * p - 1) },
      armL: { target: [414 + 4 * sin(p), 650 + 3 * sin(p + 0.5)] }, backR: { r: 0 },
      show: ["mcover", "mO", "waves"],
      fx: { ".waves path:nth-child(1)": { o: pulse(t * 2, 0.7) }, ".waves path:nth-child(2)": { o: pulse(t * 2 - 0.25, 0.7) },
            ".waves path:nth-child(3)": { o: pulse(t * 2, 0.7) }, ".waves path:nth-child(4)": { o: pulse(t * 2 - 0.25, 0.7) } } };
  } },

  thinking: { frames: 40, fps: 20, loop: true, pose(t) {
    const p = t * TAU;
    return { torso: { sy: 1 + 0.01 * sin(p) }, head: { r: 5 + 1.5 * sin(p), y: -2 * sin(p) }, tail: { r: 4 * sin(p - 1) },
      armR: { target: [655 + 2 * sin(4 * p), 712 + 4 * max(0, sin(4 * p))] }, show: ["thought", "bRaise"],
      fx: { ".thought .dots circle:nth-child(1)": { y: -12 * max(0, sin(2 * p)) }, ".thought .dots circle:nth-child(2)": { y: -12 * max(0, sin(2 * p - 0.8)) },
            ".thought .dots circle:nth-child(3)": { y: -12 * max(0, sin(2 * p - 1.6)) } } };
  } },

  speaking: { frames: 24, fps: 20, loop: true, mouth: true, pose(t) {
    const p = t * TAU, g = 0.5 - 0.5 * cos(p);
    return { torso: { sy: 1 + 0.014 * sin(2 * p) }, head: { r: 2.2 * sin(p), y: -2.2 * sin(2 * p) }, tail: { r: 5 * sin(p - 1) },
      armR: { target: [800 + 46 * g, 900 - 58 * g] }, backL: { r: 0.8 * sin(p) } };
  } },

  walking: { frames: 16, fps: 20, loop: true, pose(t) {
    const p = t * TAU, a = abs(sin(p));
    return { rig: { y: -8 * (1 - a), r: 1.6 * sin(p) }, torso: { sy: 1 + 0.012 * cos(2 * p) },
      head: { r: -1.6 * sin(p - 0.4), y: 2.5 * (1 - abs(sin(p - 0.4))) }, tail: { r: 9 * sin(p - 0.9) },
      legL: { r: 15 * sin(p) }, legR: { r: -15 * sin(p) },
      armL: { up: -17 * sin(p), fo: -10 - 7 * sin(p - 0.5) }, armR: { up: -17 * sin(p), fo: 10 - 7 * sin(p - 0.5) } };
  } },

  running: { frames: 12, fps: 24, loop: true, pose(t) {
    const p = t * TAU, a = abs(sin(p));
    return { rig: { y: -18 * (1 - a) + 4, r: 6 + 2 * sin(p), sx: 1 + 0.03 * a, sy: 1 - 0.035 * a }, torso: { sy: 1 },
      head: { r: 4 - 2 * sin(p - 0.5), y: 3 * (1 - abs(sin(p - 0.5))) }, tail: { r: 22 + 7 * sin(p - 1) },
      legL: { r: 28 * sin(p) }, legR: { r: -28 * sin(p) },
      armL: { up: 34 * sin(p) - 8, fo: -78 }, armR: { up: 34 * sin(p) + 8, fo: 78 } };
  } },

  dancing: { frames: 32, fps: 20, loop: true, pose(t) {
    const p = t * TAU, bounce = abs(sin(2 * p)), k = 0.5 + 0.5 * sin(p);
    return { rig: { y: -16 * bounce, r: 5 * sin(p) }, torso: { r: 3 * sin(2 * p) }, head: { r: -4 * sin(2 * p - 0.5), y: -3 * bounce },
      tail: { r: 12 * sin(p - 1) }, legL: { r: -14 * max(0, sin(p)) }, legR: { r: 14 * max(0, -sin(p)) },
      armL: { target: lerp2([404, 900], [372, 700], smooth(k)) }, armR: { target: lerp2([818, 900], [850, 700], smooth(1 - k)) },
      show: ["mcover", "mSmile", "notes"],
      fx: { ".notes text:nth-child(1)": { o: pulse(t, 0.8), y: -40 * (t % 1) }, ".notes text:nth-child(2)": { o: pulse(t - 0.33, 0.8), y: -40 * ((t + 0.67) % 1) },
            ".notes text:nth-child(3)": { o: pulse(t - 0.66, 0.8), y: -40 * ((t + 0.34) % 1) } } };
  } },

  sleeping: { frames: 36, fps: 12, loop: true, pose(t) {
    const p = t * TAU, z = i => { const q = ((t + i / 3) % 1); return { o: pulse(q, 0.95), x: 26 * q, y: -40 * q, s: 0.7 + 0.5 * q }; };
    return { torso: { sy: 1 + 0.022 * sin(p) }, head: { y: 14 + 2.5 * sin(p - 0.4), r: 9 + 1.2 * sin(p - 0.4) }, tail: { r: 12 + 1.5 * sin(p) },
      show: ["zzz"], fx: { ".zzz text:nth-child(1)": z(0), ".zzz text:nth-child(2)": z(1), ".zzz text:nth-child(3)": z(2) } };
  } },

  waving: { frames: 20, fps: 20, loop: true, pose(t) {
    const p = t * TAU, base = ik("R", [846, 700]);
    return { rig: { r: -1.5 }, torso: { sy: 1 + 0.01 * sin(p) }, head: { r: 3 + 1.5 * sin(p - 0.6) }, tail: { r: 6 * sin(p - 1) },
      armR: { up: base.up + 4 * sin(p - 0.3), fo: base.fo + 22 * sin(p) }, show: ["mcover", "mSmile"] };
  } },

  celebrating: { frames: 32, fps: 20, loop: true, next: "idle", pose(t) {
    const crouch = seg(t, 0, 0.14) * (1 - seg(t, 0.14, 0.22));
    const up = seg(t, 0.16, 0.42) * (1 - seg(t, 0.55, 0.78));
    const land = seg(t, 0.74, 0.8) * (1 - seg(t, 0.8, 0.95));
    const y = -130 * up + 10 * crouch + 8 * land;
    const sy = 1 - 0.08 * crouch - 0.09 * land + 0.05 * up * (1 - seg(t, 0.38, 0.5));
    const arms = clamp01(up * 1.3);
    return { rig: { y, sx: 2 - sy, sy }, head: { y: 4 * crouch - 4 * up, r: -3 * up }, tail: { r: -18 * up + 10 * land },
      legL: { r: -10 * up }, legR: { r: 10 * up },
      armL: { target: lerp2([420, 900], [362, 712], arms) }, armR: { target: lerp2([800, 900], [860, 712], arms) },
      show: ["mcover", "mSmile", "sparkles", "burst"],
      fx: { ".sparkles": { o: up, s: 0.6 + 0.5 * up }, ".burst": { o: seg(t, 0.3, 0.42) * (1 - seg(t, 0.5, 0.62)), s: 0.8 + 0.3 * up } } };
  } },

  error: { frames: 28, fps: 20, loop: true, pose(t) {
    const p = t * TAU;
    return { torso: { sy: 1 + 0.01 * sin(p) }, head: { r: -4 + 3 * sin(p), x: 2.5 * sin(3 * p) }, tail: { r: 20 + 2 * sin(p) },
      glasses: { y: 10, r: -8 + 1.5 * sin(p) }, armL: { target: [432 + 9 * sin(4 * p), 662 + 6 * cos(4 * p)] },
      show: ["mcover", "mFrown", "bWorry", "sweat"], fx: { ".sweat": { o: pulse(t, 0.9), y: 34 * t } } };
  } },
};

// ---- apply a pose to the <nour-nx> rig (transforms around the rig's own pivots)
function tf(o = {}) {
  return `translate(${(o.x || 0).toFixed(2)}px, ${(o.y || 0).toFixed(2)}px) rotate(${(o.r || 0).toFixed(2)}deg) scale(${(o.sx ?? o.s ?? 1).toFixed(4)}, ${(o.sy ?? o.s ?? 1).toFixed(4)})`;
}
const FACE = ["mcover", "mOpen", "mSmile", "mFrown", "mFlat", "mO", "bWorry", "bAngry", "bRaise", "flush", "sweat", "tear",
  "zzz", "waves", "thought", "bulb", "qmarks", "sparkles", "notes", "steam", "bubbles", "dots3", "burst", "dust", "portal", "laptop", "book", "cloth", "mug", "phone", "thumb", "pen", "clip", "watch"];

function poseFrame(el, name, i) {
  const R = el.shadowRoot, q = s => R.querySelector(s), seqDef = SEQ[name];
  const t = i / seqDef.frames, P = seqDef.pose(t);
  for (const s of ["rig", "torso", "head", "tail", "legL", "legR", "armL", "armR", "armLF", "armRF", "glasses"]) { const e = q("." + s); if (e) e.style.transform = "none"; }
  R.querySelectorAll(".fore").forEach(e => (e.style.transform = "none"));
  q(".rig").style.transform = tf(P.rig); q(".torso").style.transform = tf(P.torso); q(".head").style.transform = tf(P.head);
  q(".tail").style.transform = tf(P.tail); q(".legL").style.transform = tf(P.legL); q(".legR").style.transform = tf(P.legR);
  q(".glasses").style.transform = tf(P.glasses);
  // arms: original traced arms at rest, bendable vector arms when posed
  for (const side of ["L", "R"]) {
    const front = P["arm" + side], back = q(".arm" + side), fr = q(".arm" + side + "F"), edge = q(".te" + side);
    if (front) {
      const a = front.target ? ik(side, front.target) : front;
      back.style.opacity = "0"; fr.style.opacity = "1"; edge.style.opacity = "1";
      fr.style.transform = `rotate(${a.up.toFixed(2)}deg)`;
      fr.querySelectorAll(".fore").forEach(f => (f.style.transform = `rotate(${a.fo.toFixed(2)}deg)`));
    } else {
      back.style.opacity = "1"; fr.style.opacity = "0"; edge.style.opacity = "0";
      back.style.transform = tf(P["back" + side]);
    }
  }
  // shadow follows the body height
  const lift = Math.max(0, -(P.rig?.y || 0));
  q(".shadow").style.transform = `scale(${(1 - lift / 320).toFixed(3)})`; q(".shadow").style.opacity = String((0.45 * (1 - lift / 260)).toFixed(3));
  // faces & effects
  for (const c of FACE) { const e = q("." + c); if (e) { e.style.opacity = (P.show || []).includes(c) ? "1" : "0"; e.style.transform = "none"; } }
  R.querySelectorAll(".fx *").forEach(e => { e.style.opacity = ""; e.style.transform = ""; });
  for (const [sel, o] of Object.entries(P.fx || {})) R.querySelectorAll(sel).forEach(e => { if (o.o !== undefined) e.style.opacity = String(o.o.toFixed(3)); e.style.transform = tf(o); });
}

// mouth anchor (centre + angle) of the current frame, in frame pixels
function mouthAnchor(el) {
  const R = el.shadowRoot, head = R.querySelector(".head");
  let a = R.querySelector("#mA"), b = R.querySelector("#mB");
  if (!a) {
    const NS = "http://www.w3.org/2000/svg";
    a = document.createElementNS(NS, "circle"); a.id = "mA"; a.setAttribute("cx", "611"); a.setAttribute("cy", "651"); a.setAttribute("r", "0.5"); a.setAttribute("fill", "none");
    b = document.createElementNS(NS, "circle"); b.id = "mB"; b.setAttribute("cx", "661"); b.setAttribute("cy", "651"); b.setAttribute("r", "0.5"); b.setAttribute("fill", "none");
    head.append(a, b);
  }
  const host = el.getBoundingClientRect(), ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
  const ax = ra.x + ra.width / 2 - host.x, ay = ra.y + ra.height / 2 - host.y, bx = rb.x + rb.width / 2 - host.x, by = rb.y + rb.height / 2 - host.y;
  return [Math.round(ax * 10) / 10, Math.round(ay * 10) / 10, Math.round(Math.atan2(by - ay, bx - ax) * 1800 / Math.PI) / 10];
}

window.NX_SEQ = SEQ; window.poseFrame = poseFrame; window.mouthAnchor = mouthAnchor;
