import test from "node:test";
import assert from "node:assert/strict";
import { compararComMedia, contasDeDespesa, dozeAntes } from "./dre-media.js";

/* Demonstrativo inventado: despesa negativa, como o SimplesVet manda. */
const meses = (ano) => Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, "0")}/${ano}`);
const bloco = (ano, salario, aluguel) => ({
  meses: meses(ano),
  linhas: [
    { nome: "Receita", nivel: 1, valores: Array(12).fill(1000) },
    { nome: "Despesas operacionais", nivel: 1, valores: salario.map((s, i) => -(s + aluguel[i])) },
    { nome: "Pessoal", nivel: 2, valores: salario.map((s) => -s) },
    { nome: "Salários", nivel: 3, valores: salario.map((s) => -s) },
    { nome: "Aluguel", nivel: 2, valores: aluguel.map((a) => -a) },
    { nome: "Lucro líquido", nivel: 0, valores: Array(12).fill(0) },
  ],
});

test("doze meses antes atravessam o ano", () => {
  const j = dozeAntes(2026, 1);
  assert.deepEqual(j[0], { ano: 2025, m0: 1 });
  assert.deepEqual(j[11], { ano: 2026, m0: 0 });
});

test("contas de despesa com caminho e valor positivo, sem a receita", () => {
  const c = contasDeDespesa(bloco(2026, Array(12).fill(100), Array(12).fill(50)));
  assert.deepEqual(c.map((x) => x.caminho), ["despesas operacionais", "despesas operacionais > pessoal", "despesas operacionais > pessoal > salarios", "despesas operacionais > aluguel"]);
  assert.equal(c[1].valores[0], 100);
});

test("mês contra a média dos 12 anteriores, nas duas unidades", () => {
  const dres = {
    2025: { unidades: { matriz: bloco(2025, Array(12).fill(100), Array(12).fill(50)) } },
    2026: {
      unidades: {
        matriz: bloco(2026, [100, 100, 100, 100, 100, 100, 100, 100, 160, 0, 0, 0], Array(12).fill(50)),
        filial: { meses: ["09/2026"], linhas: [{ nome: "Despesas operacionais", nivel: 2, valores: [-10] }, { nome: "Pessoal", nivel: 3, valores: [-10] }] },
      },
    },
  };
  const r = compararComMedia(dres, { unit: "consolidado", ano: 2026, mes: 8 });
  assert.equal(r.mesesNaMedia, 12);
  const pessoal = r.linhas.find((l) => l.caminho === "despesas operacionais > pessoal");
  /* 160 + 10 da filial contra média 100. */
  assert.equal(pessoal.valor, 170);
  assert.equal(pessoal.media, 100);
  assert.equal(pessoal.dif, 70);
  assert.equal(pessoal.pct, 70);
  const aluguel = r.linhas.find((l) => l.caminho === "despesas operacionais > aluguel");
  assert.equal(aluguel.pct, 0);
  assert.equal(r.linhas[0].caminho, "despesas operacionais");
});
