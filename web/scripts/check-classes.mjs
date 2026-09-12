/* Classe usada no JSX sem regra no CSS não avisa: o elemento só fica sem
   estilo. Quando é um <canvas> que dependia de position:absolute, ele entra
   no fluxo, infla e empurra a tela inteira para fora — foi assim que o
   Ranking apareceu vazio em produção com o dado todo presente.

   Só olha className estático. Classe montada em template literal fica de
   fora, porque não dá para saber o valor sem executar. */
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const src = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

async function arquivos(dir, ext) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const f = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await arquivos(f, ext)));
    else if (ext.test(e.name)) out.push(f);
  }
  return out;
}

let css = "";
for (const f of await arquivos(src, /\.css$/)) css += await readFile(f, "utf8");

/* Vem de biblioteca ou do maplibre, não do nosso CSS */
const externas = [/^maplibregl-/, /^sileo/, /^ui-/];

const orfas = new Map();
for (const f of await arquivos(src, /\.jsx?$/)) {
  const txt = await readFile(f, "utf8");
  for (const m of txt.matchAll(/className="([^"{}]+)"/g)) {
    for (const c of m[1].split(/\s+/).filter(Boolean)) {
      if (externas.some((r) => r.test(c))) continue;
      if (new RegExp(`\\.${c.replace(/[-]/g, "\\-")}(?![\\w-])`).test(css)) continue;
      orfas.set(c, (orfas.get(c) || new Set()).add(f.split("/src/")[1]));
    }
  }
}

if (orfas.size) {
  for (const [c, fs] of orfas) console.error(`classe sem CSS  .${c}  (${[...fs].join(", ")})`);
  console.error(`\n${orfas.size} classe(s) usada(s) no JSX sem regra em nenhum CSS`);
  process.exit(1);
}
console.log("classes ok");
