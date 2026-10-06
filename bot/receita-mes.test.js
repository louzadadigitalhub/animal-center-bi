import test from "node:test";
import assert from "node:assert/strict";
import {
  baixasPorMesDeBaixa,
  cardConfere,
  filaDeMeses,
  leituraFechada,
  oficialDoMes,
  periodoDoMes,
  somarOficiais,
} from "./receita-mes.js";

test("setembro vai do dia 1 ao 30 e agosto do dia 1 ao 31", () => {
  const set = periodoDoMes(2026, 8);
  assert.equal(set.from, "01/09/2026");
  assert.equal(set.to, "30/09/2026");
  assert.equal(set.chave, "2026-09");
  const ago = periodoDoMes(2026, 7);
  assert.equal(ago.from, "01/08/2026");
  assert.equal(ago.to, "31/08/2026");
  assert.equal(periodoDoMes(2024, 1).to, "29/02/2024");
});

test("mês fechado lido depois do último dia não entra de novo na fila", () => {
  const set = periodoDoMes(2026, 8);
  assert.equal(leituraFechada({ ...set, receitaTotalExata: 419676.01, at: "2026-09-30T23:00:00-03:00" }, set), false);
  assert.equal(leituraFechada({ ...set, receitaTotalExata: 419676.01, at: "2026-10-02T14:00:00-03:00" }, set), true);
  const ago = periodoDoMes(2026, 7);
  const fila = filaDeMeses(
    { y: 2026, m: 10 },
    {
      anoInicio: 2026,
      limite: 4,
      jaLidos: {
        "2026-09": { ...set, receitaTotalExata: 419676.01, at: "2026-10-02T14:00:00-03:00" },
        "2026-08": { ...ago, receitaTotalExata: 1, at: "2026-10-02T14:00:00-03:00" },
      },
    }
  );
  /* Outubro sempre. Setembro também, porque acabou de fechar.
     Agosto já foi lido depois do dia 31, então pula. */
  assert.deepEqual(fila.map((m) => m.chave), ["2026-10", "2026-09", "2026-07", "2026-06"]);
  assert.equal(fila[0].from, "01/10/2026");
  assert.equal(fila[0].to, "31/10/2026");
  assert.equal(fila[0].aberto, true);
});

test("outubro não apaga a receita de setembro", () => {
  const snap = {
    snapshot: {
      caixaOficial: {
        matriz: { period: "01/10/2026-31/10/2026", receitaTotalExata: 100 },
      },
      caixaOficialMeses: {
        matriz: {
          "2026-09": { chave: "2026-09", from: "01/09/2026", to: "30/09/2026", receitaTotalExata: 419676.01 },
          "2026-10": { chave: "2026-10", from: "01/10/2026", to: "31/10/2026", receitaTotalExata: 100 },
        },
        filial: {
          "2026-09": { chave: "2026-09", from: "01/09/2026", to: "30/09/2026", receitaTotalExata: 22745.85 },
        },
      },
    },
  };
  assert.equal(oficialDoMes(snap, "matriz", 2026, 8).receitaTotalExata, 419676.01);
  assert.equal(oficialDoMes(snap, "matriz", 2026, 9).receitaTotalExata, 100);
  assert.equal(oficialDoMes(snap, "matriz", 2026, 7), null);
  assert.equal(oficialDoMes(snap, "filial", 2026, 8).receitaTotalExata, 22745.85);
  const duas = somarOficiais(
    snap.snapshot.caixaOficialMeses.matriz["2026-09"],
    snap.snapshot.caixaOficialMeses.filial["2026-09"]
  );
  assert.equal(duas.receitaTotalExata, 442421.86);
});

test("card que pegou a tela de hoje não confere com as baixas do mês", () => {
  const rows = [
    { "Status da venda": "Baixada", "Data baixa": "15/09/2026 10:00", "Líquido": "400.000,00", _sede: "matriz" },
    { "Status da venda": "Baixada", "Data baixa": "02/09/2026", "Líquido": "21.613,01" },
    { "Status da venda": "Em aberto", "Data baixa": "", "Líquido": "999,00" },
    { "Status da venda": "Baixada", "Data baixa": "10/09/2026", "Líquido": "22.745,85", _sede: "filial" },
  ];
  const b = baixasPorMesDeBaixa(rows);
  assert.equal(Math.round(b.matriz["2026-09"] * 100) / 100, 421613.01);
  assert.equal(b.filial["2026-09"], 22745.85);
  assert.equal(cardConfere(421613.01, b.matriz["2026-09"]), true);
  /* 06/10/2026: a página abre no dia de hoje e o filtro ainda não tinha
     voltado. A matriz gravou R$ 3.239,50 em todos os meses. */
  assert.equal(cardConfere(3239.5, b.matriz["2026-09"]), false);
  assert.equal(cardConfere(22745.85 * 0.96, b.filial["2026-09"]), true);
  assert.equal(cardConfere(0, 0), true);
  assert.equal(cardConfere(3239.5, 0), false);
  assert.equal(cardConfere(null, 1000), false);
});

test("fila não entra em mês antes da unidade existir", () => {
  const jaLidos = {};
  for (let m = 3; m <= 8; m++) {
    const p = periodoDoMes(2026, m - 1);
    jaLidos[p.chave] = { ...p, receitaTotalExata: 1, at: "2026-10-02T14:00:00-03:00" };
  }
  /* São Cristóvão abriu em mar/2025: jan e fev/2025 não têm card e cada
     um esperava 4 min por ciclo até desistir. */
  const fila = filaDeMeses({ y: 2026, m: 10 }, { anoInicio: 2023, desde: "2025-03", jaLidos, limite: 8 });
  assert.deepEqual(fila.map((m) => m.chave), ["2026-10", "2026-09", "2026-02", "2026-01", "2025-12", "2025-11", "2025-10", "2025-09"]);
  const fim = filaDeMeses({ y: 2025, m: 5 }, { anoInicio: 2023, desde: "2025-03", limite: 8 });
  assert.deepEqual(fim.map((m) => m.chave), ["2025-05", "2025-04", "2025-03"]);
});
