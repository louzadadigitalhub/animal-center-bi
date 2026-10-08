import test from "node:test";
import assert from "node:assert/strict";
import { acharNo, arvoreDre, juntarNos, temValor } from "./dre-arvore.js";

/* Recorte de uma DRE real: a ordem e o nível vêm do SimplesVet. */
const linhas = [
  { nome: "Lucro líquido", nivel: 0, total: true, valor: 100 },
  { nome: "Resultado operacional", nivel: 1, total: true, valor: 300 },
  { nome: "Despesas operacionais", nivel: 2, total: true, valor: -900 },
  { nome: "Pessoal", nivel: 3, total: true, valor: -700 },
  { nome: "Salários", nivel: 4, total: false, valor: -650.5 },
  { nome: "Vale-transporte", nivel: 4, total: false, valor: -49.5 },
  { nome: "Aluguel", nivel: 3, total: false, valor: -200 },
  { nome: "Seguro", nivel: 3, total: false, valor: 0 },
  { nome: "Despesas não operacionais", nivel: 1, total: true, valor: -200 },
];

test("árvore: cada conta fica embaixo da que tem nível menor logo acima", () => {
  const a = arvoreDre(linhas);
  assert.equal(a.length, 1);
  assert.deepEqual(a[0].filhos.map((n) => n.nome), ["Resultado operacional", "Despesas não operacionais"]);
  const op = acharNo(a, "despesas OPERACIONAIS");
  assert.deepEqual(op.filhos.map((n) => n.nome), ["Pessoal", "Aluguel", "Seguro"]);
  assert.deepEqual(acharNo(a, "pessoal").filhos.map((n) => n.valor), [-650.5, -49.5]);
  assert.equal(acharNo(a, "Despesas nao operacionais").nome, "Despesas não operacionais");
  assert.equal(acharNo(a, "nao existe"), null);
});

test("conta zerada e sem nada embaixo não aparece", () => {
  const op = acharNo(arvoreDre(linhas), "Despesas operacionais");
  assert.deepEqual(op.filhos.filter(temValor).map((n) => n.nome), ["Pessoal", "Aluguel"]);
});

test("as duas unidades: soma conta a conta pelo nome, em todos os níveis", () => {
  const matriz = acharNo(arvoreDre(linhas), "Despesas operacionais").filhos;
  const filial = acharNo(
    arvoreDre([
      { nome: "Despesas operacionais", nivel: 1, total: true, valor: -130 },
      { nome: "Pessoal", nivel: 2, total: true, valor: -100 },
      { nome: "Salarios", nivel: 3, total: false, valor: -100 },
      { nome: "Internet", nivel: 2, total: false, valor: -30 },
    ]),
    "Despesas operacionais"
  ).filhos;
  const juntas = juntarNos([matriz, filial]);
  assert.deepEqual(juntas.map((n) => [n.nome, n.valor]), [["Pessoal", -800], ["Aluguel", -200], ["Seguro", 0], ["Internet", -30]]);
  assert.deepEqual(juntas[0].filhos.map((n) => [n.nome, n.valor]), [["Salários", -750.5], ["Vale-transporte", -49.5]]);
});
