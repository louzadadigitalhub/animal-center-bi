import test from "node:test";
import assert from "node:assert/strict";
import { aggregate } from "./aggregate.js";

test("DRE acha as baixas do mes mesmo sem montar as views pesadas", () => {
  const agg = aggregate(
    [
      { "Data e hora": "10/09/2026 10:00", "Status da venda": "Baixado", Liquido: "100,00", _sede: "matriz" },
      { "Data e hora": "11/09/2026 10:00", "Status da venda": "Baixado", Liquido: "20,00", _sede: "filial" },
      { "Data e hora": "02/10/2026 10:00", "Status da venda": "Baixado", Liquido: "5,00", _sede: "matriz" },
      { "Data e hora": "12/09/2026 10:00", "Status da venda": "Em aberto", Liquido: "999,00", _sede: "matriz" },
    ],
    { soConsultas: true }
  );
  assert.equal(agg.views.matriz, undefined);
  assert.equal(agg.baixasPorMes.matriz[2026][8], 100);
  assert.equal(agg.baixasPorMes.filial[2026][8], 20);
  assert.equal(agg.baixasPorMes.matriz[2026][9], 5);
});
