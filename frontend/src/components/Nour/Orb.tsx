import { useEffect, useRef } from 'react';

export type OrbMood = 'idle' | 'listening' | 'thinking' | 'speaking';

const MOODS: Record<OrbMood, [energy: number, spin: number]> = {
  idle: [0.35, 0.25],
  listening: [0.65, 0.45],
  thinking: [1, 1.1],
  speaking: [0.8, 0.55],
};

type Vec = [number, number, number];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec): Vec => {
  const l = Math.hypot(...a);
  return [a[0] / l, a[1] / l, a[2] / l];
};
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

interface Strand { u: Vec; v: Vec; k: number; amp: number; ph: number; spd: number; drift: number; hue: number; w: number }

function makeStrands(n: number): Strand[] {
  return Array.from({ length: n }, (_, i) => {
    const th = rnd(0, Math.PI * 2);
    const ph = Math.acos(rnd(-1, 1));
    const nrm: Vec = [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)];
    const a: Vec = Math.abs(nrm[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = norm(cross(nrm, a));
    return {
      u, v: cross(nrm, u), k: 2 + (i % 4), amp: rnd(0.01, 0.045), ph: rnd(0, 6.28),
      spd: rnd(0.4, 1.3), drift: rnd(-0.25, 0.25), hue: rnd(262, 300), w: rnd(0.6, 1.4),
    };
  });
}

/** A plasma sphere of light strands that reacts to the assistant's state. */
export function Orb({ mood, className }: { mood: OrbMood; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const moodRef = useRef(mood);
  moodRef.current = mood;

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const cx = cv.getContext('2d');
    if (!cx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const strands = makeStrands(13);
    let dpr = 1;
    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = cv.height = Math.round(cv.clientWidth * dpr);
    };
    const ro = new ResizeObserver(size);
    ro.observe(cv);
    size();

    let energy = 0.35, spin = 0.25, rot = 0, t = 0, last = performance.now(), raf = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      const m = moodRef.current;
      const [eT, sT] = MOODS[m];
      energy += (eT - energy) * Math.min(1, dt * 3);
      spin += (sT - spin) * Math.min(1, dt * 2);
      rot += dt * spin;
      const speak = m === 'speaking' ? 0.04 * Math.sin(t * 9) * Math.sin(t * 2.3) : 0;
      const breath = 1 + 0.015 * Math.sin(t * 1.6) + speak + (m === 'thinking' ? 0.01 * Math.sin(t * 14) : 0);

      const S = cv.width, c = S / 2, R = S * 0.3 * breath;
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.clearRect(0, 0, S, S);
      cx.globalCompositeOperation = 'lighter';

      let g = cx.createRadialGradient(c, c, R * 0.7, c, c, R * 1.62);
      g.addColorStop(0, `rgba(150,90,255,${0.1 + 0.12 * energy})`);
      g.addColorStop(1, 'rgba(80,30,160,0)');
      cx.fillStyle = g;
      cx.fillRect(0, 0, S, S);
      const nx = c + Math.cos(t * 0.5) * R * 0.25, ny = c + Math.sin(t * 0.37) * R * 0.2;
      g = cx.createRadialGradient(nx, ny, 0, nx, ny, R * 0.95);
      g.addColorStop(0, `rgba(90,60,230,${0.22 + 0.18 * energy})`);
      g.addColorStop(0.6, 'rgba(120,40,200,0.08)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = g;
      cx.fillRect(0, 0, S, S);

      const tilt = 0.35, ct = Math.cos(tilt), st = Math.sin(tilt), N = 120, CH = 12;
      for (const s of strands) {
        const pts: [number, number, number, number][] = [];
        const wob = s.amp * (0.6 + energy * 1.4);
        const ro2 = rot * (1 + s.drift), c2 = Math.cos(ro2), s2 = Math.sin(ro2);
        for (let i = 0; i <= N; i++) {
          const a = (i / N) * Math.PI * 2;
          const r = 1 + wob * Math.sin(s.k * a + s.ph + t * s.spd * (0.5 + energy)) + 0.03 * Math.sin(3 * a - t * 0.7 + s.ph);
          let x = (Math.cos(a) * s.u[0] + Math.sin(a) * s.v[0]) * r;
          let y = (Math.cos(a) * s.u[1] + Math.sin(a) * s.v[1]) * r;
          let z = (Math.cos(a) * s.u[2] + Math.sin(a) * s.v[2]) * r;
          [x, z] = [x * c2 + z * s2, -x * s2 + z * c2];
          [y, z] = [y * ct - z * st, y * st + z * ct];
          const p = 1 / (1 - z * 0.18);
          pts.push([c + x * R * p, c + y * R * p, z, Math.hypot(x, y)]);
        }
        for (let k = 0; k < N; k += CH) {
          const mid = pts[k + (CH >> 1)];
          const front = (mid[2] + 1) / 2;
          const rim = Math.pow(Math.min(1, mid[3]), 6);
          const key = Math.max(0, ((mid[0] - c) * 0.55 + (mid[1] - c) * 0.45) / R);
          const alpha = (0.04 + 0.28 * front * front + 0.9 * rim * (0.35 + key)) * (0.55 + 0.6 * energy);
          cx.beginPath();
          cx.moveTo(pts[k][0], pts[k][1]);
          for (let i = k + 1; i <= Math.min(N, k + CH); i++) cx.lineTo(pts[i][0], pts[i][1]);
          cx.lineCap = 'round';
          cx.strokeStyle = `hsla(${s.hue},100%,62%,${alpha * 0.22})`;
          cx.lineWidth = s.w * dpr * 5;
          cx.stroke();
          cx.strokeStyle = `hsla(${s.hue + 10},100%,${78 + 18 * rim}%,${Math.min(1, alpha)})`;
          cx.lineWidth = s.w * dpr * 0.9;
          cx.stroke();
        }
      }
      raf = reduce ? window.setTimeout(() => requestAnimationFrame(frame), 120) : requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(raf);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" style={{ width: '100%', height: '100%', display: 'block' }} />;
}
