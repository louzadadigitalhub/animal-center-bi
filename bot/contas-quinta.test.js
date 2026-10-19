import test from "node:test";
import assert from "node:assert/strict";
import { cruzar, lerBoleto, lerNfe, montarSemana, mod10, semanaDaQuinta, valorEVencimentoDoTexto } from "./contas-quinta.js";

/* Monta uma linha digitável válida a partir do código de barras (44 dígitos),
   com os dígitos verificadores de cada campo — como os bancos fazem. */
function linhaDe(barras) {
  const campo = (s) => s + mod10(s);
  const c1 = campo(barras.slice(0, 4) + barras.slice(19, 24));
  const c2 = campo(barras.slice(24, 34));
  const c3 = campo(barras.slice(34, 44));
  return `${c1.slice(0, 5)}.${c1.slice(5)} ${c2.slice(0, 5)}.${c2.slice(5)} ${c3.slice(0, 5)}.${c3.slice(5)} ${barras[4]} ${barras.slice(5, 19)}`;
}
const barras = (fator, centavos) => "341" + "9" + "7" + String(fator).padStart(4, "0") + String(centavos).padStart(10, "0") + "1790010104351004791020150";

test("boleto: valor e vencimento da linha digitável, no ciclo novo do fator (desde 22/02/2025)", () => {
  // 20/10/2026 = 605 dias depois de 22/02/2025 -> fator 1605. R$ 350,00.
  const linha = linhaDe(barras(1605, 35000));
  const b = lerBoleto(`Pague até o vencimento. Linha digitável: ${linha}`, new Date("2026-10-15T12:00:00Z"));
  assert.equal(b.valor, 350);
  assert.equal(b.vencimento, "2026-10-20");
  assert.equal(b.tipo, "bancario");
});

test("boleto: número qualquer não vira boleto (dígito verificador confere)", () => {
  const linha = linhaDe(barras(1605, 35000));
  const errada = linha.replace(/^(\d)/, (d) => String((Number(d) + 1) % 10));
  assert.equal(lerBoleto(`linha ${errada}`, new Date("2026-10-15")), null);
  assert.equal(lerBoleto("CNPJ 12.345.678/0001-90 pedido 4455667788", new Date("2026-10-15")), null);
});

test("NF-e: emitente, número e cada parcela com vencimento e valor", () => {
  const xml = `<nfeProc><NFe><infNFe><ide><nNF>12345</nNF></ide><emit><CNPJ>11222333000144</CNPJ><xNome>TCR Comercio de Gas e Maquinas Ltda</xNome></emit>
    <total><ICMSTot><vNF>700.00</vNF></ICMSTot></total><cobr><dup><nDup>001</nDup><dVenc>2026-10-20</dVenc><vDup>350.00</vDup></dup>
    <dup><nDup>002</nDup><dVenc>2026-11-20</dVenc><vDup>350.00</vDup></dup></cobr></infNFe></NFe></nfeProc>`;
  const n = lerNfe(xml);
  assert.equal(n.cnpj, "11222333000144");
  assert.equal(n.fornecedor, "TCR Comercio de Gas e Maquinas Ltda");
  assert.equal(n.numero, "12345");
  assert.deepEqual(n.parcelas, [{ numero: "001", vencimento: "2026-10-20", valor: 350 }, { numero: "002", vencimento: "2026-11-20", valor: 350 }]);
  assert.equal(lerNfe("<html>não é nota</html>"), null);
});

test("texto: valor e vencimento escritos no e-mail", () => {
  assert.deepEqual(valorEVencimentoDoTexto("Sua fatura de R$ 1.234,56 vence em 22/10/2026.", new Date("2026-10-15")), { valor: 1234.56, vencimento: "2026-10-22" });
  assert.deepEqual(valorEVencimentoDoTexto("Vencimento: 05/11 - Valor: 89,90", new Date("2026-10-15")), { valor: 89.9, vencimento: "2026-11-05" });
});

test("semana da quinta: de quinta a quarta; fora da quinta, prepara a próxima", () => {
  assert.deepEqual(semanaDaQuinta(new Date("2026-10-22T10:00:00-03:00")), { quinta: "2026-10-22", ate: "2026-10-28" });
  assert.deepEqual(semanaDaQuinta(new Date("2026-10-19T10:00:00-03:00")), { quinta: "2026-10-22", ate: "2026-10-28" });
  assert.deepEqual(semanaDaQuinta(new Date("2026-10-23T08:00:00-03:00")), { quinta: "2026-10-29", ate: "2026-11-04" });
});

test("cruzar e montar a semana: pagar, atrasadas e o que chegou sem lançamento", () => {
  const sv = [
    { unidade: "matriz", id: "1", fornecedor: "TCR Comercio de Gas e Maquinas Ltda", descricao: "Oxigênio bloco", valor: 350, vencimento: "2026-10-23", pago: false },
    { unidade: "matriz", id: "2", fornecedor: "Energia", descricao: "Luz", valor: 812.4, vencimento: "2026-10-15", pago: false },
    { unidade: "filial", id: "3", fornecedor: "Aluguel", descricao: "Aluguel", valor: 4000, vencimento: "2026-11-10", pago: false },
  ];
  const emails = [
    { id: "a", caixa: "Financeiro", de: "nfe@tcr.com.br", assunto: "NF 12345", fornecedor: "TCR Comercio de Gas", valor: 350, vencimento: "2026-10-23", fonte: "nfe" },
    { id: "b", caixa: "Centro", de: "cobranca@labvet.com.br", assunto: "Boleto LabVet", fornecedor: "LabVet", valor: 1290, vencimento: "2026-10-26", fonte: "boleto" },
    { id: "c", caixa: "Centro", de: "cobranca@labvet.com.br", assunto: "Boleto LabVet dezembro", fornecedor: "LabVet", valor: 1290, vencimento: "2026-12-26", fonte: "boleto" },
  ];
  const casou = cruzar(sv, emails);
  assert.equal(casou.get("a"), "matriz:1");
  assert.equal(casou.has("b"), false);
  const s = montarSemana({ sv, emails, hoje: new Date("2026-10-22T07:00:00-03:00") });
  assert.deepEqual(s.semana, { quinta: "2026-10-22", ate: "2026-10-28" });
  assert.deepEqual(s.pagar.map((x) => x.id), ["1"]);
  assert.deepEqual(s.atrasadas.map((x) => x.id), ["2"]);
  assert.deepEqual(s.naoLancadas.map((x) => x.id), ["b"]);
  assert.equal(s.totalPagar, 350);
  assert.equal(s.totalAtrasadas, 812.4);
});

test("lançamento do SimplesVet: só o que a lista usa, pago pelo campo foi_pago", async () => {
  const { lancamento } = await import("./pagar-sv.js");
  const x = { id: "991", descricao: "Oxigênio bloco ", valor: "350.00", vencimento: "2026-10-20", competencia: "2026-05-14", foi_pago: "Não",
    status: "N", status_formatado: "Não pago", parcela: "...", numero_parcela: "6", fornecedor: { id: "622093", nome: "TCR Comercio de Gas e Maquinas Ltda" },
    categorias: [{ id: "1", nome: "Material Aplicado Interno", principal: true, valor: "350.00" }] };
  assert.deepEqual(lancamento(x, "matriz"), { unidade: "matriz", id: "991", fornecedor: "TCR Comercio de Gas e Maquinas Ltda", descricao: "Oxigênio bloco",
    valor: 350, vencimento: "2026-10-20", competencia: "2026-05-14", pago: false, status: "Não pago", parcela: "6", categoria: "Material Aplicado Interno" });
  assert.equal(lancamento({ ...x, foi_pago: "Sim", status_formatado: "Pago" }, "matriz").pago, true);
});

test("a mesma cobrança em dois e-mails (ou nota + boleto) vira uma só", async () => {
  const { unirDuplicadas } = await import("./contas-quinta.js");
  const emails = [
    { id: "x1", caixa: "Financeiro", de: "nfe@tcrgas.com.br", fornecedor: "nfe@tcrgas.com.br", valor: 200, vencimento: "2026-10-22", fonte: "boleto" },
    { id: "x2", caixa: "Financeiro", de: "nfe@tcrgas.com.br", fornecedor: "nfe@tcrgas.com.br", valor: 200, vencimento: "2026-10-22", fonte: "boleto" },
    { id: "y1", caixa: "Financeiro", de: "totvsibasa@ibasa.com.br", fornecedor: "totvsibasa@ibasa.com.br", valor: 953.9, vencimento: "2026-10-26", fonte: "boleto" },
    { id: "y2", caixa: "Financeiro", de: "nfe@bage.com.br", fornecedor: "IMPORTADORA BAGE S.A.", cnpj: "1", valor: 953.9, vencimento: "2026-10-26", fonte: "nfe" },
    { id: "z", caixa: "Centro", de: "a@b.com", fornecedor: "Outro", valor: 200, vencimento: "2026-11-30", fonte: "texto" },
  ];
  const u = unirDuplicadas(emails);
  assert.equal(u.length, 3);
  const bage = u.find((x) => x.valor === 953.9);
  assert.equal(bage.fonte, "nfe");
  assert.equal(bage.fornecedor, "IMPORTADORA BAGE S.A.");
  assert.deepEqual(bage.ids.sort(), ["y1", "y2"]);
  assert.equal(u.find((x) => x.id === "x1").vezes, 2);
});

test("recibo sem vencimento fica fora; nota sem parcela e aviso sem valor vão para conferir", () => {
  const emails = [
    { id: "r", caixa: "Centro Pet", fornecedor: "Mercado Livre", valor: 30.27, vencimento: null, fonte: "texto", data: "2026-10-18" },
    { id: "n", caixa: "Centro", fornecedor: "ZOETIS", valor: 56000, vencimento: null, fonte: "nfe", data: "2026-10-16" },
    { id: "k", caixa: "Financeiro", fornecedor: "KOB", valor: null, vencimento: "2026-10-20", fonte: "texto", data: "2026-10-15" },
    { id: "g", caixa: "Financeiro", fornecedor: "KOB", valor: 9545.25, vencimento: "2026-10-27", fonte: "texto", data: "2026-10-15" },
  ];
  const s = montarSemana({ sv: [], emails, hoje: new Date("2026-10-22T07:00:00-03:00") });
  assert.deepEqual(s.naoLancadas.map((x) => x.id), ["g"]);
  assert.deepEqual(s.conferir.map((x) => x.id).sort(), ["k", "n"]);
  assert.equal(s.totalNaoLancadas, 9545.25);
});
