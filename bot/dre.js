/* Serve o DRE que o collect-dre.js trouxe do SimplesVet.

   Antes a DRE do painel tinha seis linhas de custo que eu inventei
   (Pessoal, Aluguel, Energia, Marketing, Laboratorio, Outras), todas em
   zero. O portal ja mantem o demonstrativo com o plano de contas que a
   clinica de fato usa, entao aqui a gente so repassa a arvore deles.

   Cada unidade tem a propria arvore, e elas nao sao iguais: a matriz tem
   63 linhas encabecadas por "Lucro liquido", a filial tem 36 e chama de
   "Resultado liquido"; ate os nomes divergem ("SimplesVet" x "Simples
   Vet"). Por isso nao existe soma linha a linha entre as duas — para o
   consolidado devolvemos as duas arvores e quem chama decide. */
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/* O ano corrente fica em dre.json, relido a cada 6 h. Ano fechado fica
   em dre-<ano>.json, lido uma vez só depois de 31/12 — como as vendas e
   a receita, mês que passou não se lê de novo. */
export function arquivoDre(ano, anoAtual) {
  return Number(ano) >= Number(anoAtual) ? "dre.json" : `dre-${ano}.json`;
}

export function dreFechadoLido(dados, ano) {
  if (!dados || Number(dados.ano) !== Number(ano)) return false;
  if (!Object.values(dados.unidades || {}).every((bl) => blocoValido(bl, ano))) return false;
  /* at é UTC: 03:00 de 1/1 é a meia-noite de Brasília. */
  return String(dados.at || "") >= `${Number(ano) + 1}-01-01T03:00`;
}

/* Todos os meses do bloco são do ano pedido. Em 07/10/2026 a filial de
   2023-2025 veio de 12/1969 a 10/2026 (682 meses): o Demonstrativo não
   aceita período que começa antes da unidade existir e cai no padrão. */
export function blocoValido(bloco, ano) {
  const m = bloco?.meses;
  const doAno = new RegExp(`^\\d{2}/${Number(ano)}$`);
  return Array.isArray(m) && m.length > 0 && m.length <= 12 && m.every((x) => doAno.test(x));
}

/* inicios: primeiro mês de cada unidade ("aaaa-mm"). Ano antes dele a
   unidade não existia; no ano dele, o período começa naquele mês. */
export function inicioDaUnidade(inicios, unit, ano) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(inicios?.[unit] || ""));
  if (!m) return { pular: false, mes: 1 };
  if (Number(ano) < Number(m[1])) return { pular: true, mes: 1 };
  return { pular: false, mes: Number(ano) === Number(m[1]) ? Number(m[2]) : 1 };
}

/* Um cache por arquivo: com chave única, dois anos gravados no mesmo
   instante e do mesmo tamanho se confundiriam. */
const cache = new Map();

async function lerArquivo(arq) {
  let chave;
  try {
    const s = await stat(arq);
    chave = `${s.mtimeMs}:${s.size}`;
  } catch {
    return null;
  }
  if (cache.get(arq)?.chave === chave) return cache.get(arq).dados;
  try {
    const dados = JSON.parse(await readFile(arq, "utf8"));
    cache.set(arq, { chave, dados });
    return dados;
  } catch {
    return null;
  }
}

/* Bloco com meses de outro ano não aparece: melhor a unidade sem DRE
   do que um número errado. */
async function ler(dataDir, year) {
  for (const nome of ["dre.json", `dre-${year}.json`]) {
    const d = await lerArquivo(join(dataDir, nome));
    if (!d || Number(d.ano) !== Number(year)) continue;
    const todas = Object.entries(d.unidades || {});
    const boas = todas.filter(([, bl]) => blocoValido(bl, year));
    return boas.length === todas.length ? d : { ...d, unidades: Object.fromEntries(boas) };
  }
  return null;
}

/* O demonstrativo e olhado para frente: outubro, novembro e dezembro ja
   vinham preenchidos em setembro porque aluguel, salario e parcela a
   vencer ficam lancados na competencia futura. A receita desses meses,
   nao — so o que ja esta agendado. O saldo de um mes que ainda nao
   aconteceu e, portanto, despesa quase completa contra receita quase
   vazia, e some com um prejuizo que nao existe. Daí a marca de estagio:
   a tela precisa dizer se o mes fechou, esta correndo ou ainda vem. */
function estagioDoMes(year, month, agora) {
  if (year < agora.getFullYear()) return "fechado";
  if (year > agora.getFullYear()) return "futuro";
  if (month < agora.getMonth()) return "fechado";
  if (month > agora.getMonth()) return "futuro";
  return "em curso";
}

/* ---------- Despesas pela regra da clinica ----------

   "Contas / despesas" = soma destes quatro grupos do Demonstrativo, em
   regime de caixa e so o que foi pago. Definido pela clinica em 25/09.

   Acha pelo nome e nao pela posicao: cada unidade pendura os grupos num
   lugar diferente da arvore (na filial "Deducoes de venda" fica dentro
   de "Receita liquida", na matriz nao), e o nivel ja mudou uma vez
   quando o portal trocou o recuo de 15 para 16 pixels.

   Grupo sem nenhum lancamento pago no mes nem aparece na tabela do
   portal — a filial nao teve "Despesas com mercadorias" paga em
   setembro. Entra como zero e marcado, para a tela nao sumir com ele. */
export const GRUPOS_DESPESA = [
  "Despesas com mercadorias",
  "Despesas operacionais",
  "Deduções de venda",
  "Despesas não operacionais",
];

const semAcento = (t) =>
  String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

/* Indice de cada um dos quatro grupos na arvore, ou -1. Se um deles
   estivesse pendurado dentro de outro, somar os dois contaria o mesmo
   dinheiro duas vezes; nesse caso fica so o de fora. */
function indicesDosGrupos(linhas) {
  const alvo = GRUPOS_DESPESA.map(semAcento);
  const achados = alvo.map((g) => linhas.findIndex((l) => semAcento(l.nome) === g));
  const paiDe = (i) => {
    for (let k = i - 1; k >= 0; k--) if (linhas[k].nivel < linhas[i].nivel) return k;
    return -1;
  };
  const descendeDe = (i, j) => {
    for (let k = paiDe(i); k >= 0; k = paiDe(k)) if (k === j) return true;
    return false;
  };
  return achados.map((i) => (i >= 0 && achados.some((j) => j >= 0 && j !== i && descendeDe(i, j)) ? -1 : i));
}

const centavos = (n) => Math.round((n || 0) * 100) / 100;

/* valorDe(linha) -> numero. Devolve os quatro grupos com o valor
   positivo (e despesa, a tela nao precisa do sinal) e o total. */
function despesasDe(linhas, valorDe) {
  const idx = indicesDosGrupos(linhas);
  const grupos = GRUPOS_DESPESA.map((nome, k) => {
    const i = idx[k];
    return { nome, valor: i >= 0 ? centavos(-valorDe(linhas[i])) : 0, lancado: i >= 0 };
  });
  return { grupos, total: centavos(grupos.reduce((a, g) => a + g.valor, 0)) };
}

/* month e o indice 0-11 que o painel usa, ou "all" para o ano inteiro. */
function fatiar(bloco, year, month, agora) {
  if (!bloco?.meses?.length) return null;
  const col = (m) => bloco.meses.indexOf(`${String(m + 1).padStart(2, "0")}/${year}`);

  if (month !== "all") {
    const idx = col(month);
    if (idx < 0) return null;
    return {
      ambiente: bloco.ambiente,
      periodo: `${MESES_CURTOS[month]}/${year}`,
      estagio: estagioDoMes(year, month, agora),
      despesas: despesasDe(bloco.linhas, (l) => l.valores[idx] ?? 0),
      linhas: bloco.linhas.map((l) => ({
        nome: l.nome,
        nivel: l.nivel,
        total: l.total,
        valor: Math.round(l.valores[idx] ?? 0),
      })),
    };
  }

  /* No ano soma coluna a coluna, e so ate o mes corrente: incluir os
     meses que ainda nao chegaram jogaria despesa agendada contra
     receita que ainda nao foi vendida. */
  const ultimo = year < agora.getFullYear() ? 11 : year > agora.getFullYear() ? -1 : agora.getMonth();
  const cols = [];
  for (let m = 0; m <= ultimo; m++) {
    const i = col(m);
    if (i >= 0) cols.push(i);
  }
  if (!cols.length) return null;
  return {
    ambiente: bloco.ambiente,
    periodo: ultimo === 11 ? String(year) : `jan a ${MESES_CURTOS[ultimo]}/${year}`,
    estagio: ultimo === 11 ? "fechado" : "em curso",
    despesas: despesasDe(bloco.linhas, (l) => cols.reduce((a, i) => a + (l.valores[i] || 0), 0)),
    linhas: bloco.linhas.map((l) => ({
      nome: l.nome,
      nivel: l.nivel,
      total: l.total,
      valor: Math.round(cols.reduce((a, i) => a + (l.valores[i] || 0), 0)),
    })),
  };
}

/* A matriz do ano inteira, para exportar. A tela mostra um mes por vez,
   mas o contador quer as doze colunas de uma vez para fechar o exercicio.
   Vai junto o indice do ultimo mes realizado: as colunas seguintes tem
   despesa lancada e receita ainda nao vendida, e quem le a planilha
   precisa saber disso sem ter que deduzir. */
export async function matrizAnual(dataDir, unit, year) {
  const d = await ler(dataDir, year);
  if (!d || Number(d.ano) !== Number(year)) return null;
  const agora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const ultimoRealizado =
    year < agora.getFullYear() ? 11 : year > agora.getFullYear() ? -1 : agora.getMonth();

  const unidades = unit === "consolidado" ? ["matriz", "filial"] : [unit];
  const partes = unidades
    .map((u) => {
      const b = d.unidades[u];
      if (!b?.linhas?.length) return null;
      const porMes = b.meses.map((_, i) => despesasDe(b.linhas, (l) => l.valores[i] ?? 0));
      return {
        unit: u,
        ambiente: b.ambiente,
        meses: b.meses,
        despesas: {
          grupos: GRUPOS_DESPESA.map((nome, k) => ({
            nome,
            valores: porMes.map((m) => m.grupos[k].valor),
            acumulado: centavos(porMes.slice(0, ultimoRealizado + 1).reduce((a, m) => a + m.grupos[k].valor, 0)),
          })),
          totais: porMes.map((m) => m.total),
          acumulado: centavos(porMes.slice(0, ultimoRealizado + 1).reduce((a, m) => a + m.total, 0)),
        },
        linhas: b.linhas.map((l) => ({
          nome: l.nome,
          nivel: l.nivel,
          total: l.total,
          valores: l.valores,
          acumulado: l.valores
            .slice(0, ultimoRealizado + 1)
            .reduce((a, v) => a + (v || 0), 0),
        })),
      };
    })
    .filter(Boolean);
  if (!partes.length) return null;
  return { at: d.at, regime: d.regime, situacao: d.situacao || "todas", ano: Number(year), ultimoRealizado, partes };
}

/* Doze meses de despesa, ja somados nos quatro grupos. A receita nao
   mora aqui: o painel cola a Receita total (recebimentos) por cima.
   Resultado = soma das despesas − essa receita. */
export async function historicoDespesas(dataDir, unit, year) {
  const d = await ler(dataDir, year);
  if (!d || Number(d.ano) !== Number(year)) return null;
  const unidades = unit === "consolidado" ? ["matriz", "filial"] : [unit];
  const blocos = unidades.map((u) => d.unidades?.[u]).filter((b) => b?.meses?.length);
  if (!blocos.length) return null;
  const meses = [];
  for (let m = 0; m < 12; m++) {
    const grupos = GRUPOS_DESPESA.map((nome) => ({ nome, valor: 0, lancado: false }));
    for (const b of blocos) {
      const idx = b.meses.indexOf(`${String(m + 1).padStart(2, "0")}/${year}`);
      if (idx < 0) continue;
      const des = despesasDe(b.linhas, (l) => l.valores[idx] ?? 0);
      des.grupos.forEach((g, k) => {
        grupos[k].valor = centavos(grupos[k].valor + g.valor);
        grupos[k].lancado = grupos[k].lancado || g.lancado;
      });
    }
    meses.push({
      m,
      grupos,
      despesas: centavos(grupos.reduce((a, g) => a + g.valor, 0)),
    });
  }
  return meses;
}

export async function dreDoPortal(dataDir, unit, year, month) {
  const d = await ler(dataDir, year);
  if (!d || Number(d.ano) !== Number(year)) return null;
  /* Horario de Brasilia, nao o do servidor: o painel inteiro usa esse
     fuso para decidir que dia e hoje. */
  const agora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));

  const unidades = unit === "consolidado" ? ["matriz", "filial"] : [unit];
  const partes = unidades
    .map((u) => {
      const p = fatiar(d.unidades[u], year, month, agora);
      return p ? { unit: u, ...p } : null;
    })
    .filter(Boolean);
  if (!partes.length) return null;
  return { at: d.at, regime: d.regime, situacao: d.situacao || "todas", partes };
}
