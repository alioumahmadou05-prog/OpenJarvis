// Build a single self-contained preview page: compiled cat module inlined into the template.
import { readFileSync, writeFileSync } from "node:fs";
const js = readFileSync("build/renderer/cat/nour-cat.js", "utf8");
const tpl = readFileSync("preview/cat-preview.template.html", "utf8");
writeFileSync("preview/Nour Cat.html", tpl.replace("/*__CAT__*/", () => js.replace(/^export /gm, "")));
console.log("preview/Nour Cat.html written");
