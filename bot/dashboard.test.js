import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { colunaDoMes, contasDoMes, gravarAjuste, lerAjustes, mesesEntre, montarDashboard, validarAjuste } from "./dashboard.js";

/* Números inventados, com as mesmas relações da planilha. */
const meses = (ano) => Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, "0")}/${ano}`);
const linha = (nome, nivel, mes9) => ({ nome, nivel, total: true, id: "", valores: Array.from({ length: 12 }, (_, i) => (i === 8 ? mes9 : 0)) });

const matriz = {
  meses: meses(2026),
  linhas: [
    linha("Lucro líquido", 0, 1),
    linha("Deduções de venda", 1, -1300),
    linha("Taxa operadora cartão", 3, -1000),
    linha("Taxa de antecipação", 3, -30),
    linha("Impostos", 3, -2000),
    linha("Simples nacional", 4, -1800),
    linha("Despesas com mercadorias", 1, -10000),
    linha("Despesas operacionais", 1, -20000),
    linha("Pessoal", 3, -12000),
    linha("Despesas administrativas", 4, -9000.5),
    linha("Despesas não operacionais", 1, -3000),
    linha("Investimentos", 2, -1800),
    linha("Pagamento de Empréstimos", 2, -1200),
  ],
};
const filial = {
  meses: meses(2026),
  linhas: [
    linha("Resultado líquido", 0, 1),
    linha("Taxa operadora cartão", 4, -100),
    linha("Impostos", 4, -200),
    linha("Despesas operacionais", 2, -4000),
    linha("Despesas Administrativas", 3, -2999.5),
    linha("Despesas não operacionais", 2, -500),
  ],
};

test("contas do mês pelo nome, em qualquer nível, sem acento e positivas", () => {
  const c = contasDoMes(matriz, 2026, 8);
  assert.deepEqual(c, {
    mercadoria: 1000000,
    operacional: 2000000,
    impostos: 200000,
    cartao: 100000,
    naoOperacional: 300000,
    emprestimos: 120000,
    administrativas: 900050,
  });
  assert.equal(contasDoMes(filial, 2026, 8).administrativas, 299950);
  assert.equal(contasDoMes(filial, 2026, 8).mercadoria, 0);
  assert.equal(contasDoMes(matriz, 2025, 8), null);
});

test("coluna: as contas da planilha", () => {
  const contas = { mercadoria: 1000000, operacional: 2400000, impostos: 220000, cartao: 110000, naoOperacional: 350000, emprestimos: 120000, administrativas: 1200000 };
  const c = colunaDoMes({ chave: "2026-09", receita: 5000000, contas, prolaboreDigitado: 1000000, justo: 200000 });
  const v = c.valores;
  assert.equal(v.fat, 50000);
  assert.equal(v.prolabore, 10000);
  assert.equal(v.oper, 14000);
  /* 50000 − 10000 − 14000 − 10000 − 2200 − 1100 */
  assert.equal(v.resOp, 12700);
  assert.equal(v.invest, 2300);
  assert.equal(v.emprestimos, 1200);
  assert.equal(v.resLiq, 9200);
  assert.equal(v.resProOp, 22700);
  assert.equal(v.justo, 2000);
  assert.equal(v.resOpRend, 20700);
  assert.equal(v.resLiqRend, 17200);
  assert.equal(c.origem.prolabore, "digitado");

  /* Sem pró-labore digitado, vale a conta. O resultado operacional não muda:
     o pró-labore sai da despesa operacional e entra na própria linha. */
  const auto = colunaDoMes({ chave: "2026-09", receita: 5000000, contas, justo: 200000 });
  assert.equal(auto.valores.prolabore, 12000);
  assert.equal(auto.valores.oper, 12000);
  assert.equal(auto.valores.resOp, 12700);
  assert.equal(auto.origem.prolabore, "conta");
});

test("mês sem demonstrativo mostra só o faturamento", () => {
  const c = colunaDoMes({ chave: "2023-01", receita: 100, contas: null, justo: 0 });
  assert.equal(c.semDemonstrativo, true);
  assert.equal(c.valores.fat, 1);
  assert.equal(c.valores.resOp, null);
});

test("meses entre duas chaves, virando o ano", () => {
  assert.deepEqual(mesesEntre("2025-11", "2026-02"), ["2025-11", "2025-12", "2026-01", "2026-02"]);
  assert.deepEqual(mesesEntre("2026-13", "2026-02"), []);
});

test("dashboard soma as duas unidades e marca receita sem card", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dash-"));
  await writeFile(join(dir, "dre.json"), JSON.stringify({ at: "2026-10-20T10:00:00Z", ano: 2026, unidades: { matriz, filial } }));
  const receitas = {
    2026: {
      matriz: Array.from({ length: 12 }, () => ({ total: 40000.1, oficial: true })),
      filial: Array.from({ length: 12 }, (_, m) => ({ total: 2000, oficial: m !== 7 })),
    },
  };
  const d = await montarDashboard(dir, {
    de: "2026-08",
    ate: "2026-10",
    receitas,
    ajustes: { prolabore: { "2026-09": 11000 }, justo: { padrao: 1000 }, notas: { "2026-09": "ok" } },
    agora: new Date(2026, 9, 20),
  });
  assert.deepEqual(d.colunas.map((c) => c.chave), ["2026-08", "2026-09", "2026-10"]);
  const set = d.colunas[1];
  assert.equal(set.valores.fat, 42000.1);
  assert.equal(set.valores.merc, 10000);
  assert.equal(set.valores.oper, 24000 - 11000);
  assert.equal(set.valores.impostos, 2200);
  assert.equal(set.valores.taxa, 1100);
  assert.equal(set.valores.invest, 3500 - 1200);
  assert.equal(set.valores.justo, 1000);
  assert.equal(set.origem.fat, "card");
  assert.equal(d.colunas[0].origem.fat, "baixas");
  assert.equal(d.colunas[2].estagio, "em curso");
  assert.deepEqual(d.notas, { "2026-09": "ok" });
});

test("ajustes: valida, grava, e vazio apaga", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dash-aj-"));
  assert.equal(validarAjuste({ campo: "prolabore", chave: "2026-13", valor: 1 }), "mes invalido");
  assert.equal(validarAjuste({ campo: "senha", chave: "2026-01", valor: 1 }), "campo invalido");
  assert.equal(validarAjuste({ campo: "prolabore", chave: "2026-01", valor: -5 }), "valor invalido");
  assert.equal(validarAjuste({ campo: "justo", chave: "padrao", valor: "" }), "o padrao nao pode ficar vazio");
  await gravarAjuste(dir, { campo: "prolabore", chave: "2026-09", valor: "98000" });
  await gravarAjuste(dir, { campo: "justo", chave: "padrao", valor: 25000 });
  await gravarAjuste(dir, { campo: "nota", chave: "2026-09", valor: "  revisar estoque  " });
  let a = await lerAjustes(dir);
  assert.equal(a.prolabore["2026-09"], 98000);
  assert.equal(a.justo.padrao, 25000);
  assert.equal(a.notas["2026-09"], "revisar estoque");
  await gravarAjuste(dir, { campo: "prolabore", chave: "2026-09", valor: null });
  a = await lerAjustes(dir);
  assert.equal(a.prolabore["2026-09"], undefined);
});
