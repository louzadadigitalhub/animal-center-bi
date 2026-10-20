import test from "node:test";
import assert from "node:assert/strict";
import { comparativo, conversaoMensal, faturamentoPor, fluxoHora, noCorte, rankingVets, recorrenciaMensal } from "./analises.js";

/* Vendas inventadas, no formato que o aggregate devolve. */
let seq = 1;
const v = (data, { valor = 100, user = "Dra. Ana", codigo = "1", animal = "Rex", grupoSV = "Consultas", unit = "matriz", hora = 10, venda, produto = "Consulta" } = {}) => {
  const [d, m, y] = data.split("/").map(Number);
  return { dt: { d, m, y }, valor, user, codigo, cliente: `Cliente ${codigo}`, animal, grupoSV, unit, hora, venda: venda ?? String(seq++), produto };
};

test("dia de corte: até o dia pedido; mês mais curto entra inteiro", () => {
  assert.equal(noCorte({ d: 20 }, 20), true);
  assert.equal(noCorte({ d: 21 }, 20), false);
  assert.equal(noCorte({ d: 28 }, 31), true);
  assert.equal(noCorte({ d: 31 }, null), true);
});

test("comparativo soma o líquido pela data da venda, com dia de corte", () => {
  const linhas = [
    v("05/09/2025", { valor: 100 }),
    v("25/09/2025", { valor: 50 }),
    v("05/09/2026", { valor: 120, unit: "filial" }),
    v("28/02/2026", { valor: 10 }),
  ];
  const todo = comparativo(linhas);
  assert.deepEqual(todo.anos, [2025, 2026]);
  assert.equal(todo.porAno[2025].fat[8], 150);
  const corte = comparativo(linhas, { dia: 20 });
  assert.equal(corte.porAno[2025].fat[8], 100);
  assert.equal(corte.porAno[2026].fat[1], 0);
  assert.equal(comparativo(linhas, { dia: 31 }).porAno[2026].fat[1], 10);
  assert.equal(comparativo(linhas, { unit: "matriz" }).porAno[2026].fat[8], 0);
});

test("fluxo por hora conta a venda uma vez, não cada item", () => {
  const linhas = [v("01/09/2026", { venda: "7", hora: 9 }), v("01/09/2026", { venda: "7", hora: 9 }), v("02/09/2026", { venda: "8", hora: 14 })];
  const f = fluxoHora(linhas, { ano: 2026 });
  assert.equal(f.meses[0].m, 8);
  assert.equal(f.meses[0].valores[9], 1);
  assert.equal(f.meses[0].valores[14], 1);
});

test("recorrência: novo é quem comprou pela primeira vez no mês", () => {
  const linhas = [v("10/03/2026", { codigo: "1" }), v("10/09/2026", { codigo: "1" }), v("11/09/2026", { codigo: "2" })];
  const r = recorrenciaMensal(linhas, { ano: 2026 });
  assert.deepEqual(r.meses[8], { m: 8, clientes: 2, novos: 1, recorrentes: 1, fat: 200 });
});

test("faturamento por funcionário com variação contra o ano anterior", () => {
  const linhas = [v("10/09/2026", { user: "Ana", valor: 300 }), v("10/09/2025", { user: "Ana", valor: 200 }), v("10/09/2026", { user: "Bia", valor: 100 })];
  const r = faturamentoPor(linhas, { ano: 2026, mes: 8, dim: "funcionario" });
  assert.equal(r.total, 400);
  assert.equal(r.linhas[0].nome, "Ana");
  assert.equal(r.linhas[0].varPct, 50);
  assert.equal(r.linhas[0].parte, 75);
  assert.equal(r.linhas[1].varPct, null);
});

test("conversão mensal: consulta e vacina por visita, exame por item", () => {
  const linhas = [
    v("10/09/2026", { grupoSV: "Consultas" }),
    v("10/09/2026", { grupoSV: "Consultas" }),
    v("10/09/2026", { grupoSV: "Exames" }),
    v("10/09/2026", { grupoSV: "Exames" }),
    v("12/09/2026", { grupoSV: "Vacinas" }),
    v("12/09/2026", { grupoSV: "Vacinas" }),
  ];
  const c = conversaoMensal(linhas, { ano: 2026 });
  assert.equal(c.consultas[8], 1);
  assert.equal(c.exames[8], 2);
  assert.equal(c.vacinas[8], 1);
});

test("rankings: exame, cirurgia e internação vão para quem consultou", () => {
  const linhas = [];
  /* Ana: 10 consultas em pacientes diferentes; 4 exames, 2 internações e
     1 cirurgia depois delas, lançados por outras pessoas. */
  for (let i = 1; i <= 10; i++) linhas.push(v(`0${(i % 9) + 1}/09/2026`, { user: "Ana", codigo: String(i), animal: `Pet${i}`, valor: 200 }));
  linhas.push(v("02/09/2026", { user: "Lab", codigo: "1", animal: "Pet1", grupoSV: "Exames" }));
  linhas.push(v("02/09/2026", { user: "Lab", codigo: "1", animal: "Pet1", grupoSV: "Exames" }));
  linhas.push(v("03/09/2026", { user: "Lab", codigo: "2", animal: "Pet2", grupoSV: "Exames" }));
  linhas.push(v("03/09/2026", { user: "Lab", codigo: "2", animal: "Pet2", grupoSV: "Exames" }));
  linhas.push(v("03/09/2026", { user: "Int", codigo: "3", animal: "Pet3", grupoSV: "Internamento" }));
  linhas.push(v("04/09/2026", { user: "Int", codigo: "3", animal: "Pet3", grupoSV: "Internamento" }));
  linhas.push(v("05/09/2026", { user: "Int", codigo: "4", animal: "Pet4", grupoSV: "Internamento" }));
  linhas.push(v("20/09/2026", { user: "Cir", codigo: "5", animal: "Pet5", grupoSV: "Cirurgias" }));
  /* Pet6 consultou em 07/09; exame 3 dias depois passa da janela de 2. */
  linhas.push(v("10/09/2026", { user: "Lab", codigo: "6", animal: "Pet6", grupoSV: "Exames" }));
  /* Bia: 10 consultas, 5 vacinas, sem nada depois. */
  for (let i = 1; i <= 10; i++) linhas.push(v(`1${i % 9}/09/2026`, { user: "Bia", codigo: `b${i}`, animal: "Mia", valor: 100 }));
  for (let i = 1; i <= 5; i++) linhas.push(v(`2${i}/09/2026`, { user: "Bia", codigo: `b${i}`, animal: "Mia", grupoSV: "Vacinas", valor: 50 }));
  /* Caixa: 2 consultas só, fica fora. */
  linhas.push(v("10/09/2026", { user: "Recepção", codigo: "x" }), v("11/09/2026", { user: "Recepção", codigo: "y" }));

  const r = rankingVets(linhas, { ano: 2026, mes: 8, notas: { Ana: { soma: 45, n: 5 }, Bia: { soma: 40, n: 4 } } });
  const ana = r.vets.find((x) => x.nome === "Ana");
  const bia = r.vets.find((x) => x.nome === "Bia");
  assert.equal(r.vets.length, 2);
  assert.deepEqual(r.fora.map((x) => x.nome), ["Recepção"]);
  assert.equal(ana.consultas, 10);
  assert.equal(ana.exames, 4);
  assert.equal(ana.examesPorConsulta, 0.4);
  assert.equal(ana.internacoes, 2);
  assert.equal(ana.internacao, 20);
  assert.equal(ana.cirurgias, 1);
  assert.equal(ana.consultasPorCirurgia, 10);
  assert.equal(ana.ticket, 200);
  assert.equal(ana.nota, 9);
  assert.equal(bia.nota, null, "4 avaliações não bastam com mínimo 5");
  assert.equal(bia.atendimentos, 15);
  /* 10 consultas de 100 + 5 vacinas de 50, para 10 clientes. */
  assert.equal(bia.ticket, 125);
  assert.equal(ana.posicoes.atendimentos, 2);
  assert.equal(bia.posicoes.consultasPorCirurgia, 2, "sem cirurgia fica no fim");
  assert.equal(ana.coroa, 1);
  assert.equal(ana.pontos, 7);
});

test("pesos mudam a Coroa de Ouro", () => {
  const linhas = [];
  for (let i = 1; i <= 10; i++) linhas.push(v(`0${(i % 9) + 1}/09/2026`, { user: "Ana", codigo: String(i), valor: 300 }));
  for (let i = 1; i <= 10; i++) linhas.push(v(`1${i % 9}/09/2026`, { user: "Bia", codigo: `b${i}`, valor: 100 }));
  for (let i = 1; i <= 9; i++) linhas.push(v(`2${i}/09/2026`, { user: "Bia", codigo: `b${i}`, grupoSV: "Vacinas" }));
  const pesos = { ticket: 0, consultasPorCirurgia: 0, examesPorConsulta: 0, internacao: 0, atendimentos: 1, nota: 0 };
  const r = rankingVets(linhas, { ano: 2026, mes: 8, config: { pesos } });
  assert.equal(r.vets[0].nome, "Bia");
  const r2 = rankingVets(linhas, { ano: 2026, mes: 8, config: { pesos: { ...pesos, ticket: 5 } } });
  assert.equal(r2.vets[0].nome, "Ana");
});
