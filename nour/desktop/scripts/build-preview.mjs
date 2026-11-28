// Build self-contained preview pages: the compiled character module inlined into the template.
import { readFileSync, writeFileSync } from "node:fs";
const tpl = readFileSync("preview/cat-preview.template.html", "utf8");
const inline = f => readFileSync(f, "utf8").replace(/^export /gm, "");

writeFileSync("preview/Nour Cat.html", tpl.replace("/*__CAT__*/", () => inline("build/renderer/cat/nour-cat.js")));

const monkey = tpl
  .replaceAll("nour-cat", "nour-monkey")
  .replace("<title>Nour Cat</title>", "<title>Nour Monkey</title>")
  .replace("NOUR · CAT", "NOUR · Nx")
  .replace("Nour's original animated cat, with 9 states.", "Nour's animated monkey, with 9 states.")
  .replace(/<div class="lbl">Fur<\/div>\s*<div class="btns">.*?<\/div>/s, "")
  .replaceAll(' fur="brown"', "");
writeFileSync("preview/Nour Monkey.html", monkey.replace("/*__CAT__*/", () => inline("build/renderer/cat/nour-monkey.js")));
console.log("previews written");

const nxTpl = readFileSync("preview/nx-preview.template.html", "utf8");
writeFileSync("preview/Nour Nx.html", nxTpl.replace("/*__VOICE__*/", () => inline("build/renderer/voice/nour-voice.js")).replace("/*__NX__*/", () => inline("build/renderer/character/nour-nx.js")));
console.log("Nour Nx preview written");
