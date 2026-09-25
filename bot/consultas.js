/* Consultas pesadas, numa thread so delas.

   O painel inteiro pergunta coisas que exigem varrer as 100 mil vendas:
   cada abertura da tela fazia tres varreduras (o recorte, o "hoje" e a
   "semana"), e depois de cada ciclo do robo — a cada 2 minutos — ainda
   refazia a agregacao completa do historico. Tudo isso no mesmo fio que
   responde as paginas, entao enquanto uma pessoa abria o painel as
   outras esperavam, inclusive quem so queria o login.

   Aqui o trabalho continua o mesmo, mas fora desse fio: o servidor pede
   por mensagem, esta thread calcula, e as rotas leves seguem respondendo
   no meio tempo. Os caches sao chaveados pelo mtime+tamanho dos arquivos
   que o robo grava, entao se invalidam sozinhos quando chega coleta nova. */
import { parentPort } from "node:worker_threads";
import { readFile, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { aggregate, GRUPOS } from "./aggregate.js";
import { personDashboard } from "./people.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, "..", "data");

async function chaveDe(arq) {
  const st = await stat(arq);
  return `${st.mtimeMs}:${st.size}`;
}

/* Duas pessoas abrindo o painel enquanto o arquivo ainda esta sendo lido
   disparariam a mesma agregacao duas vezes, com o dobro do tempo e da
   memoria. Quem chega com a mesma chave espera o trabalho que ja esta
   em andamento. */
const emCurso = new Map();
function umaVez(nome, chave, fazer) {
  const atual = emCurso.get(nome);
  if (atual && atual.chave === chave) return atual.p;
  const p = fazer().finally(() => {
    if (emCurso.get(nome)?.p === p) emCurso.delete(nome);
  });
  emCurso.set(nome, { chave, p });
  return p;
}

let snapCache = { chave: "", snap: null };

/* Mesmo criterio do antigo loadSnapshot do server: snapshot sem filial
   (gravado antes de a filial existir no robo) e completado com o
   aggregate das vendas. */
async function snapshot() {
  const arq = join(DATA_DIR, "snapshot.json");
  let chave;
  try {
    chave = await chaveDe(arq);
  } catch {
    return null;
  }
  if (snapCache.chave === chave) return snapCache.snap;
  return umaVez("snapshot", chave, () => montarSnapshot(arq, chave));
}

async function montarSnapshot(arq, chave) {
  const snap = JSON.parse(await readFile(arq, "utf8"));
  const temFilial = Object.values(snap?.snapshot?.views?.filial || {}).some((ano) =>
    Object.values(ano || {}).some((v) => (v?.qtd || 0) > 0)
  );
  if (!(snap?.snapshot?.hoje && temFilial)) {
    const agg = await aggregado().catch(() => null);
    if (agg) {
      snap.snapshot.views = agg.views;
      snap.snapshot.hoje = agg.hoje;
      snap.snapshot.years = agg.years || snap.snapshot.years;
    }
  }
  snapCache = { chave, snap };
  return snap;
}

let aggCache = { chave: "", agg: null };

async function aggregado() {
  const arq = join(DATA_DIR, "vendas.json");
  let chave;
  try {
    chave = await chaveDe(arq);
  } catch {
    return null;
  }
  if (aggCache.chave === chave) return aggCache.agg;
  return umaVez("aggregate", chave, async () => {
    /* Solta a copia antiga antes de montar a nova: segurar as duas ao
       mesmo tempo dobrava o pico de memoria a cada ciclo. */
    aggCache = { chave: "", agg: null };
    const agg = aggregate(JSON.parse(await readFile(arq, "utf8")));
    aggCache = { chave, agg };
    return agg;
  });
}

/* Receita total pela regra da clinica: Vendas > Recebimentos > Este mes.

   O robo le esse numero do portal a cada ciclo e grava em caixaOficial.
   Desde 15/09 a tela montava o mes a partir do aggregate, que calcula a
   receita somando as vendas marcadas como recebidas — outro numero, e o
   oficial ficava guardado sem uso. Em 25/09 o portal dava R$ 16.153,10
   para Sao Cristovao; e o que tem que aparecer.

   So vale para o mes que o robo leu (o corrente) e sem filtro de grupo:
   o card do portal e da unidade inteira, nao de um grupo. */
function comRecebimentoOficial(view, snap, unit, year, month, grupo) {
  if (!view || grupo || month === "all") return view;
  const of = snap?.snapshot?.caixaOficial?.[unit];
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(of?.period || "");
  if (!of?.receitaTotal || !m || Number(m[3]) !== year || Number(m[2]) - 1 !== month) return view;
  const doSnap = snap.snapshot.views?.[unit]?.[year]?.[month];
  return {
    ...view,
    caixa: {
      noDia: of.noDia,
      posteriores: of.posteriores,
      adiantamento: of.adiantamento,
      receitaTotal: of.receitaTotal,
      receitaTotalExata: of.receitaTotalExata ?? of.receitaTotal,
      emAberto: of.emAberto,
    },
    fat: of.receitaTotal,
    recebido: of.receitaTotal,
    /* A serie do grafico "Entrada" e por data da baixa, a mesma do card. */
    dailyFat: doSnap?.dailyFat?.some((d) => d.fat) ? doSnap.dailyFat : view.dailyFat,
    receitaFonte: { origem: "recebimentos", lidoEm: of.at || null },
  };
}

/* O que o /api/snapshot precisa, menos o que depende de quem pediu
   (permissao, DRE, fotos) — isso o servidor acrescenta. */
async function painel({ unit, year, month, grupo, pediuIntervalo, de, ate }) {
  const snap = await snapshot();
  if (!snap?.snapshot?.views) return { semDados: true };
  const grupoOk = GRUPOS.includes(grupo) ? grupo : "";
  const agg = await aggregado().catch(() => null);

  let view;
  let erroIntervalo = null;
  /* Pediu intervalo e alguma data nao passou na validacao (31/02, mes
     13...): sem view nenhuma. Cair no recorte do mes mostraria o mes
     inteiro com o rotulo de um periodo que nao existe. */
  if (pediuIntervalo) {
    if (!de || !ate) erroIntervalo = "datas invalidas";
    else {
      view = agg?.intervalo(unit, de, ate, grupoOk || undefined) || undefined;
      if (!view) erroIntervalo = "a data final e anterior a inicial";
    }
  } else if (agg) {
    view = comRecebimentoOficial(agg.recorte(unit, year, month, grupoOk), snap, unit, year, month, grupoOk);
  } else {
    view = snap.snapshot.views[unit]?.[year]?.[month];
  }

  /* Correcao herdada: a serie diaria as vezes chegava em centavos. */
  if (view) {
    const cap = Math.max(Number(view?.caixa?.receitaTotal || view?.fat) || 0, 1);
    view = {
      ...view,
      dailyFat: (view.dailyFat || []).map((row) => {
        let fat = Number(row.fat) || 0;
        while (cap > 1 && fat > cap && fat >= 100) fat /= 100;
        if (fat > 10000000) fat = 0;
        return { d: row.d, fat: Math.round(fat) };
      }),
    };
  }

  /* Receita oficial de cada unidade no mes pedido, para a aba DRE pôr ao
     lado das despesas de cada uma — no consolidado ela mostra as duas. */
  const receitasOficiais = {};
  if (!pediuIntervalo && month !== "all") {
    for (const u of ["matriz", "filial"]) {
      const of = snap.snapshot?.caixaOficial?.[u];
      const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(of?.period || "");
      if (of?.receitaTotal && m && Number(m[3]) === year && Number(m[2]) - 1 === month) {
        receitasOficiais[u] = { total: of.receitaTotalExata ?? of.receitaTotal, lidoEm: of.at || null };
      }
    }
  }

  return {
    at: snap.at,
    from: snap.from,
    to: snap.to,
    rows: snap.rows,
    receitasOficiais,
    headers: snap.snapshot.headers,
    years: snap.snapshot.years || [],
    hoje: (agg ? agg.hojeDe(unit, grupoOk) : snap.snapshot.hoje?.[unit]) || null,
    semana: (agg ? agg.semanaDe(unit, grupoOk) : snap.snapshot.semana?.[unit]) || null,
    clientesStatus: snap.snapshot.clientesStatus?.[unit] || null,
    erroIntervalo,
    view: view || null,
  };
}

async function ranking({ unit, periodo, ano, mes }) {
  const snap = await snapshot();
  if (!snap?.snapshot?.views) return { semDados: true };
  const view =
    periodo === "hoje"
      ? snap.snapshot.hoje?.[unit]
      : periodo === "semana"
        ? snap.snapshot.semana?.[unit]
        : snap.snapshot.views[unit]?.[ano]?.[periodo === "ano" ? "all" : mes];
  return { at: snap.at, rows: snap.rows, view: view || null };
}

async function caixa() {
  const snap = await snapshot();
  if (!snap) return { semDados: true };
  return { at: snap.at, from: snap.from, to: snap.to, caixa: snap.caixa || snap.snapshot?.caixaOficial || null };
}

const TAREFAS = {
  painel,
  ranking,
  caixa,
  pessoa: ({ nome, year, month }) => personDashboard(nome, year, month),
  /* Chamado logo depois de cada coleta, para a primeira pessoa que abrir
     o painel nao ser quem paga o parse. */
  aquecer: async () => {
    await snapshot();
    await aggregado();
    return { ok: true };
  },
};

parentPort.on("message", async ({ id, tipo, args }) => {
  try {
    const f = TAREFAS[tipo];
    if (!f) throw new Error(`consulta desconhecida: ${tipo}`);
    parentPort.postMessage({ id, ok: true, r: await f(args || {}) });
  } catch (err) {
    parentPort.postMessage({ id, ok: false, erro: String(err?.message || err) });
  }
});
