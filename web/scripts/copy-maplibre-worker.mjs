/* O maplibre v6 minifica new Worker(new URL(...)) para new Worker(e,...), e o
   Vite so detecta a forma literal — o worker nunca era emitido no build e o
   mapa ficava cinza: estilo carregado, atribuicao na tela, zero tile pedido.
   Auto-hospedamos, como a doc do mapcn recomenda.

   Sao DOIS arquivos: o worker importa ./maplibre-gl-shared.mjs do lado dele.
   Copiar por script, e nao a mao, evita worker velho depois de um npm update. */
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const de = join(raiz, "node_modules", "maplibre-gl", "dist");
const para = join(raiz, "public", "maplibre");

await mkdir(para, { recursive: true });
for (const f of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  await copyFile(join(de, f), join(para, f));
  console.log("copiado", f);
}
