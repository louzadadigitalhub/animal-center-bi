import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { arquivoDre, dreFechadoLido, historicoDespesas, matrizAnual } from "./dre.js";

const bloco = (ano, valor) => ({
  at: "2026-10-07T07:00:00.000Z",
  ano,
  regime: "caixa",
  situacao: "pagos",
  unidades: {
    matriz: {
      ambiente: "Animal Center",
      meses: Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, "0")}/${ano}`),
      linhas: [{ nome: "Despesas operacionais", nivel: 1, total: true, id: "", valores: Array(12).fill(-valor) }],
    },
  },
});

test("DRE de ano fechado vem do próprio arquivo; o corrente, do dre.json", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dre-"));
  /* Mesmo tamanho e mesmo instante: o cache antigo, de chave única,
     devolveria um ano no lugar do outro. */
  await writeFile(join(dir, "dre.json"), JSON.stringify(bloco(2026, 100)));
  await writeFile(join(dir, "dre-2025.json"), JSON.stringify(bloco(2025, 200)));
  const h26 = await historicoDespesas(dir, "matriz", 2026);
  const h25 = await historicoDespesas(dir, "matriz", 2025);
  assert.equal(h26[0].despesas, 100);
  assert.equal(h25[0].despesas, 200);
  assert.ok(await matrizAnual(dir, "matriz", 2025));
  assert.equal(await historicoDespesas(dir, "matriz", 2024), null);
});

test("ano fechado só conta como guardado se foi lido depois de 31/12", () => {
  assert.equal(arquivoDre(2025, 2026), "dre-2025.json");
  assert.equal(arquivoDre(2026, 2026), "dre.json");
  assert.equal(dreFechadoLido({ ano: 2025, at: "2026-10-07T07:00:00.000Z" }, 2025), true);
  assert.equal(dreFechadoLido({ ano: 2025, at: "2025-12-31T20:00:00.000Z" }, 2025), false);
  assert.equal(dreFechadoLido({ ano: 2026, at: "2026-10-07T07:00:00.000Z" }, 2025), false);
  assert.equal(dreFechadoLido(null, 2025), false);
});
