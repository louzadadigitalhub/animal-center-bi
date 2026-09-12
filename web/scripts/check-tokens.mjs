/* Token de CSS que nao existe nao avisa: em fill/stroke o SVG cai para o
   valor inicial, que e preto. Foi assim que os pins do mapa ficaram pretos
   depois que o sistema de cor mudou de verde para navy/ciano e --accent
   deixou de existir. Este check falha o build em vez de deixar passar. */
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const src = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const css = await readFile(join(src, "index.css"), "utf8");
const definidos = new Set([...css.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]));

/* Definidos em escopo local (style inline) ou por biblioteca */
const locais = [/^--metal-/, /^--sileo-/, /^--len$/];

async function arquivos(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const f = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await arquivos(f)));
    else if (/\.(jsx?|css)$/.test(e.name)) out.push(f);
  }
  return out;
}

let orfaos = 0;
for (const f of await arquivos(src)) {
  const linhas = (await readFile(f, "utf8")).split("\n");
  linhas.forEach((ln, i) => {
    for (const m of ln.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) {
      const nome = m[1];
      if (m[2] || definidos.has(nome) || locais.some((r) => r.test(nome))) continue;
      console.error(`token inexistente  ${f.split("/src/")[1]}:${i + 1}  ${nome}`);
      orfaos += 1;
    }
  });
}

if (orfaos) {
  console.error(`\n${orfaos} referencia(s) a token que nao existe em index.css`);
  process.exit(1);
}
console.log("tokens ok");
