/* Aba Dashboard: a "DASHBOARD ANÁLISE ESTRATÉGICA" da planilha de análise
   financeira da clínica, linha por linha, montada com o que o robô já traz.

   Conferido em 20/10/2026 contra as 20 colunas da planilha (fev/2025 a
   set/2026): de maio/2025 em diante, faturamento, mercadoria, despesa
   operacional, impostos, taxa de cartão e o total não operacional batem no
   centavo, a não ser onde a planilha foi digitada à mão.

   De onde sai cada linha:
   - Faturamento: o card Receita total de Vendas › Recebimentos, as duas
     unidades somadas (sem o card do mês, as baixas — e a coluna avisa).
   - Mercadoria, impostos, taxa de cartão: a conta de mesmo nome no
     Demonstrativo do SimplesVet, regime de caixa, as duas unidades.
   - Pró-labore: não existe conta com esse nome. A clínica lança a retirada
     dos sócios em "Despesas administrativas" junto com gastos pequenos, e a
     planilha usa um número redondo, alguns mil abaixo da conta. Por isso o
     pró-labore do mês pode ser digitado; sem valor digitado, vale a conta
     "Despesas administrativas".
   - Despesa operacional: o grupo inteiro menos o pró-labore, como na
     planilha.
   - Investimentos e empréstimos: o grupo "Despesas não operacionais"
     separado em "Pagamento de Empréstimos" e o resto. A planilha separava
     até abr/2025 e depois somou os dois em Investimentos; o resultado
     líquido é o mesmo dos dois jeitos.
   - Taxa de antecipação e devoluções ficam fora, como na planilha. */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { lerDre } from "./dre.js";

const semAcento = (t) =>
  String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

const centavos = (v) => Math.round(Number(v || 0) * 100);

/* Cada uma pelo nome exato, a primeira que aparece na árvore da unidade:
   o nível muda de uma unidade para a outra (impostos é n3 na matriz e n4
   na filial). */
const CONTAS = {
  mercadoria: /^despesas com mercadorias$/,
  operacional: /^despesas operacionais$/,
  impostos: /^impostos$/,
  cartao: /^taxa operadora cartao$/,
  naoOperacional: /^despesas nao operacionais$/,
  emprestimos: /^pagamento de emprestimos$/,
  administrativas: /^despesas administrativas$/,
};

export const LINHAS = [
  { id: "fat", nome: "FATURAMENTO", cor: "roxo" },
  { id: "merc", nome: "DESPESAS COM MERCADORIA" },
  { id: "oper", nome: "DESPESAS OPERACIONAIS" },
  { id: "prolabore", nome: "PRÓ-LABORE/DIVIDENDOS" },
  { id: "impostos", nome: "IMPOSTOS" },
  { id: "taxa", nome: "TAXA OPERADORA CARTÃO" },
  { id: "resOp", nome: "RESULTADO OPERACIONAL", cor: "verde" },
  { id: "invest", nome: "INVESTIMENTOS" },
  { id: "emprestimos", nome: "EMPRÉSTIMOS" },
  { id: "resLiq", nome: "RESULTADO LÍQUIDO", cor: "azul" },
  { id: "resProOp", nome: "RESULTADO PRÓ-LABORE + OPERACIONAL", cor: "roxo" },
  { id: "justo", nome: 'PRÓ-LABORE "JUSTO"' },
  { id: "resOpRend", nome: "RESULTADO OPERACIONAL RENDIMENTO" },
  { id: "resLiqRend", nome: "RESULTADO LÍQUIDO RENDIMENTO", cor: "laranja" },
];

export const JUSTO_PADRAO = 20000;

const CHAVE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/* "2025-02" até "2026-10", mês a mês. */
export function mesesEntre(de, ate) {
  const a = CHAVE.exec(de);
  const b = CHAVE.exec(ate);
  if (!a || !b) return [];
  const ini = Number(a[1]) * 12 + Number(a[2]) - 1;
  const fim = Number(b[1]) * 12 + Number(b[2]) - 1;
  const out = [];
  for (let t = ini; t <= fim; t++) out.push(`${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`);
  return out;
}

/* Saídas do mês de uma unidade, em centavos e positivas. null quando o
   demonstrativo não tem esse mês. */
export function contasDoMes(bloco, ano, m0) {
  const idx = bloco?.meses?.indexOf(`${String(m0 + 1).padStart(2, "0")}/${ano}`) ?? -1;
  if (idx < 0) return null;
  const out = {};
  for (const [k, re] of Object.entries(CONTAS)) {
    const linha = bloco.linhas.find((l) => re.test(semAcento(l.nome)));
    out[k] = linha ? -centavos(linha.valores[idx]) : 0;
  }
  return out;
}

function somar(a, b) {
  if (!a) return b;
  if (!b) return a;
  const out = {};
  for (const k of Object.keys(CONTAS)) out[k] = (a[k] || 0) + (b[k] || 0);
  return out;
}

/* Uma coluna da planilha. Tudo em centavos até aqui; sai em reais. */
export function colunaDoMes({ chave, receita, receitaOficial = true, contas, prolaboreDigitado, justo, estagio = "fechado" }) {
  const v = { fat: receita == null ? null : receita };
  const origem = { fat: receitaOficial ? "card" : "baixas" };
  if (contas) {
    const pl = prolaboreDigitado != null ? prolaboreDigitado : contas.administrativas;
    origem.prolabore = prolaboreDigitado != null ? "digitado" : "conta";
    const fat = v.fat || 0;
    v.merc = contas.mercadoria;
    v.prolabore = pl;
    v.oper = contas.operacional - pl;
    v.impostos = contas.impostos;
    v.taxa = contas.cartao;
    v.resOp = fat - v.merc - v.oper - v.prolabore - v.impostos - v.taxa;
    v.emprestimos = contas.emprestimos;
    v.invest = contas.naoOperacional - contas.emprestimos;
    v.resLiq = v.resOp - v.invest - v.emprestimos;
    v.resProOp = v.resOp + v.prolabore;
    v.justo = justo;
    v.resOpRend = v.resProOp - v.justo;
    v.resLiqRend = v.resLiq + v.prolabore - v.justo;
  }
  const valores = {};
  for (const l of LINHAS) valores[l.id] = v[l.id] == null ? null : v[l.id] / 100;
  return { chave, estagio, semDemonstrativo: !contas, origem, valores };
}

function estagioDe(chave, agora) {
  const atual = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
  if (chave < atual) return "fechado";
  return chave === atual ? "em curso" : "futuro";
}

/* receitas: { [ano]: { matriz: [{total, oficial}] x12, filial: [...] } },
   em reais, como sai da thread de consultas. */
export async function montarDashboard(dataDir, { de, ate, receitas, ajustes = {}, agora = new Date() }) {
  const chaves = mesesEntre(de, ate);
  const dres = new Map();
  for (const ano of new Set(chaves.map((c) => Number(c.slice(0, 4))))) {
    dres.set(ano, await lerDre(dataDir, ano).catch(() => null));
  }
  const justoPadrao = ajustes.justo?.padrao ?? JUSTO_PADRAO;
  const colunas = chaves.map((chave) => {
    const ano = Number(chave.slice(0, 4));
    const m0 = Number(chave.slice(5)) - 1;
    const d = dres.get(ano);
    const contas = ["matriz", "filial"]
      .map((u) => contasDoMes(d?.unidades?.[u], ano, m0))
      .reduce(somar, null);
    const rec = ["matriz", "filial"].map((u) => receitas?.[ano]?.[u]?.[m0]).filter(Boolean);
    const receita = rec.length ? rec.reduce((a, r) => a + centavos(r.total), 0) : null;
    const pl = ajustes.prolabore?.[chave];
    return colunaDoMes({
      chave,
      receita,
      receitaOficial: rec.length > 0 && rec.every((r) => r.oficial),
      contas,
      prolaboreDigitado: pl == null ? null : centavos(pl),
      justo: centavos(ajustes.justo?.[chave] ?? justoPadrao),
      estagio: estagioDe(chave, agora),
    });
  });
  const notas = {};
  for (const c of chaves) if (ajustes.notas?.[c]) notas[c] = ajustes.notas[c];
  return { de, ate, linhas: LINHAS, colunas, notas, justoPadrao };
}

/* ---------- O que a diretoria digita ----------
   Pró-labore do mês, pró-labore "justo" (o padrão e exceções por mês) e
   o "Relatório da análise" de cada mês. Mora no volume, não no código:
   o repositório é público. */
const arqAjustes = (dataDir) => join(dataDir, "dashboard-ajustes.json");

export async function lerAjustes(dataDir) {
  try {
    const j = JSON.parse(await readFile(arqAjustes(dataDir), "utf8"));
    return { prolabore: j.prolabore || {}, justo: j.justo || {}, notas: j.notas || {} };
  } catch {
    return { prolabore: {}, justo: {}, notas: {} };
  }
}

/* campo: "prolabore" | "justo" | "nota". chave: "aaaa-mm", ou "padrao"
   para o justo. valor null apaga (o mês volta a usar a conta ou o padrão). */
export function validarAjuste({ campo, chave, valor }) {
  if (!["prolabore", "justo", "nota"].includes(campo)) return "campo invalido";
  const padrao = campo === "justo" && chave === "padrao";
  if (!padrao && !CHAVE.test(String(chave || ""))) return "mes invalido";
  if (valor == null || valor === "") return padrao ? "o padrao nao pode ficar vazio" : null;
  if (campo === "nota") return typeof valor === "string" && valor.length <= 4000 ? null : "texto longo demais";
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 && n < 1e8 ? null : "valor invalido";
}

export async function gravarAjuste(dataDir, { campo, chave, valor }) {
  const erro = validarAjuste({ campo, chave, valor });
  if (erro) throw new Error(erro);
  const a = await lerAjustes(dataDir);
  const gaveta = campo === "nota" ? a.notas : a[campo];
  if (valor == null || valor === "") delete gaveta[chave];
  else gaveta[chave] = campo === "nota" ? String(valor).trim() : Math.round(Number(valor) * 100) / 100;
  await mkdir(dataDir, { recursive: true });
  const tmp = `${arqAjustes(dataDir)}.tmp`;
  await writeFile(tmp, JSON.stringify(a, null, 1));
  await rename(tmp, arqAjustes(dataDir));
  return a;
}
