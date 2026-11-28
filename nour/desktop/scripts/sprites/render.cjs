// Renders every frame of every sequence to PNG (transparent), plus mouth visemes, then packs sprite sheets.
// Usage: node scripts/sprites/render.cjs   (after `tsc -p .`)
const { chromium } = require("playwright");
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const ROOT = path.resolve(__dirname, "../.."), OUT = path.join(ROOT, "build/frames"), W = 360;

const html = `<!doctype html><html><head><style>html,body{margin:0;background:transparent}nour-nx{width:${W}px;display:block}</style></head>
<body><nour-nx state="render"></nour-nx>
<script type="module">${fs.readFileSync(path.join(ROOT, "build/renderer/character/nour-nx.js"), "utf8").replace(/^export /gm, "")}</script>
<script>${fs.readFileSync(path.join(__dirname, "poses.js"), "utf8")}</script></body></html>`;

const VISEMES = {  // mouth shapes drawn in the character's own coordinates (cover hides the original smile)
  closed: `<path d="M590 649 Q 611 664 632 649" fill="none" stroke="#0b0806" stroke-width="6" stroke-linecap="round"/>`,
  small: `<path d="M592 645 Q 611 648 630 645 Q 628 657 611 657 Q 594 657 592 645 Z" fill="#3a1206" stroke="#0b0806" stroke-width="5" stroke-linejoin="round"/>`,
  mid: `<path d="M589 642 Q 611 646 633 642 Q 630 664 611 664 Q 592 664 589 642 Z" fill="#3a1206" stroke="#0b0806" stroke-width="5" stroke-linejoin="round"/><ellipse cx="611" cy="658" rx="9" ry="4" fill="#e8705d"/>`,
  wide: `<path d="M586 639 Q 611 645 636 639 Q 633 673 611 673 Q 589 673 586 639 Z" fill="#3a1206" stroke="#0b0806" stroke-width="5" stroke-linejoin="round"/><ellipse cx="611" cy="665" rx="11" ry="5.5" fill="#e8705d"/>`,
  round: `<ellipse cx="611" cy="654" rx="10" ry="13" fill="#3a1206" stroke="#0b0806" stroke-width="5"/>`,
};
const MBOX = [551, 619, 120, 70];   // viewBox region around the mouth

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 600, height: 700 }, deviceScaleFactor: 1 });
  const tmp = path.join(OUT, "render.html"); fs.writeFileSync(tmp, html);
  await p.goto("file://" + tmp); await p.waitForTimeout(300);
  await p.evaluate(() => { const s = document.createElement("style"); s.textContent = "*{animation:none!important;transition:none!important}.aura{opacity:0!important}"; document.querySelector("nour-nx").shadowRoot.append(s); });
  const seqs = await p.evaluate(() => Object.fromEntries(Object.entries(NX_SEQ).map(([k, v]) => [k, { frames: v.frames, fps: v.fps, loop: v.loop, next: v.next || null, mouth: !!v.mouth }])));
  const el = p.locator("nour-nx"), meta = { frame: null, sequences: {}, mouth: null };
  for (const [name, s] of Object.entries(seqs)) {
    fs.mkdirSync(path.join(OUT, name)); const anchors = [];
    for (let i = 0; i < s.frames; i++) {
      await p.evaluate(([n, i]) => poseFrame(document.querySelector("nour-nx"), n, i), [name, i]);
      if (s.mouth) anchors.push(await p.evaluate(() => mouthAnchor(document.querySelector("nour-nx"))));
      await el.screenshot({ path: path.join(OUT, name, String(i).padStart(3, "0") + ".png"), omitBackground: true });
    }
    meta.sequences[name] = { ...s, ...(s.mouth ? { mouthAnchors: anchors } : {}) };
    process.stdout.write(`${name}:${s.frames} `);
  }
  const box = await el.boundingBox(); meta.frame = { w: Math.round(box.width), h: Math.round(box.height) };
  // mouth visemes at the same scale as the frames
  const scale = meta.frame.w / 760, mw = Math.round(MBOX[2] * scale), mh = Math.round(MBOX[3] * scale);
  fs.mkdirSync(path.join(OUT, "_mouth"));
  for (const [k, shape] of Object.entries(VISEMES)) {
    await p.setContent(`<html><body style="margin:0;background:transparent"><svg id="m" width="${mw}" height="${mh}" viewBox="${MBOX.join(" ")}"><ellipse cx="611" cy="651" rx="50" ry="21" fill="#f8b682"/>${shape}</svg></body></html>`);
    await p.locator("#m").screenshot({ path: path.join(OUT, "_mouth", k + ".png"), omitBackground: true });
  }
  meta.mouth = { w: mw, h: mh, cx: (611 - MBOX[0]) * scale, cy: (651 - MBOX[1]) * scale, order: Object.keys(VISEMES) };
  fs.writeFileSync(path.join(OUT, "meta.json"), JSON.stringify(meta));
  await b.close();
  execFileSync("python3", [path.join(__dirname, "pack.py"), OUT, path.join(ROOT, "assets/sprites/nx")], { stdio: "inherit" });
})();
