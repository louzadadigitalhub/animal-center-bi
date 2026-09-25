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

/* O resumo do snapshot (snapshot-meta.json), nao o snapshot inteiro.

   O snapshot carrega as visoes pre-calculadas de todos os meses de todos
   os anos, cada uma com a lista de clientes — 88% do arquivo. Nada disso
   e usado aqui: o recorte sai do aggregate sob demanda. Fazer o parse
   dele na VPS de producao passou de 5 minutos em 25/09 e o container
   reiniciou logo depois. O robo grava o resumo a cada ciclo.

   Sem resumo ainda (o primeiro ciclo depois do deploy nao terminou), o
   painel funciona com o que da para saber sem abrir o arquivo grande: a
   data e o numero de linhas saem do comeco dele. Receita oficial e
   status de clientes voltam quando o resumo chegar. */
let metaCache = { chave: "", meta: null };

async function espiarSnapshot() {
  let f;
  try {
    const { open } = await import("node:fs/promises");
    f = await open(join(DATA_DIR, "snapshot.json"));
    const buf = Buffer.alloc(1500);
    const { bytesRead } = await f.read(buf, 0, 1500, 0);
    const t = buf.toString("utf8", 0, bytesRead);
    return {
      at: t.match(/"at":"([^"]+)"/)?.[1] || null,
      from: t.match(/"from":"([^"]+)"/)?.[1] || null,
      to: t.match(/"to":"([^"]+)"/)?.[1] || null,
      rows: Number(t.match(/"rows":(\d+)/)?.[1] || 0),
    };
  } catch {
    return null;
  } finally {
    await f?.close().catch(() => {});
  }
}

async function snapshot() {
  const arq = join(DATA_DIR, "snapshot-meta.json");
  let chave = null;
  try {
    chave = await chaveDe(arq);
  } catch {
    /* sem resumo ainda */
  }
  if (chave) {
    if (metaCache.chave === chave) return metaCache.meta;
    const meta = JSON.parse(await readFile(arq, "utf8"));
    metaCache = { chave, meta };
    return meta;
  }
  const peek = await espiarSnapshot();
  if (!peek?.at) return null;
  return { ...peek, parcial: true, caixa: null, snapshot: {} };
}

let aggCache = { chave: "", agg: null };

/* Cada recorte varre as 100 mil vendas. Na maquina de desenvolvimento
   isso leva 40ms; na VPS de producao, 2,5 a 3,8s — e a abertura do
   painel pede tres (mes, hoje, semana). Os pedidos se repetem muito
   (mesma unidade, mesmo mes), entao o resultado fica guardado ate chegar
   coleta nova. A chave leva a versao dos dados; "hoje" e "semana" levam
   tambem a data, porque mudam a meia-noite. */
const MAX_RESULTADOS = 40;
const resultados = new Map();

function lembrar(agg, partes, fazer) {
  const chave = [agg.__chave, ...partes].join("|");
  if (resultados.has(chave)) {
    const v = resultados.get(chave);
    resultados.delete(chave);
    resultados.set(chave, v);
    return v;
  }
  const v = fazer();
  resultados.set(chave, v);
  if (resultados.size > MAX_RESULTADOS) resultados.delete(resultados.keys().next().value);
  return v;
}

function hojeBR() {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return { y: d.getFullYear(), m: d.getMonth(), dia: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` };
}

const recorteDe = (agg, unit, year, month, grupo = "") =>
  lembrar(agg, ["r", unit, year, month, grupo], () => agg.recorte(unit, year, month, grupo));
const hojeDe = (agg, unit, grupo = "") => lembrar(agg, ["h", unit, grupo, hojeBR().dia], () => agg.hojeDe(unit, grupo));
const semanaDe = (agg, unit, grupo = "") => lembrar(agg, ["s", unit, grupo, hojeBR().dia], () => agg.semanaDe(unit, grupo));

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
    resultados.clear();
    const agg = aggregate(JSON.parse(await readFile(arq, "utf8")), { soConsultas: true });
    agg.__chave = chave;
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
    dailyFat: of.dailyFat?.some((d) => d.fat) ? of.dailyFat : view.dailyFat,
    receitaFonte: { origem: "recebimentos", lidoEm: of.at || null },
  };
}

/* O que o /api/snapshot precisa, menos o que depende de quem pediu
   (permissao, DRE, fotos) — isso o servidor acrescenta. */
async function painel({ unit, year, month, grupo, pediuIntervalo, de, ate }) {
  const snap = await snapshot();
  const agg = await aggregado().catch(() => null);
  if (!snap || !agg) return { semDados: true };
  const grupoOk = GRUPOS.includes(grupo) ? grupo : "";

  let view;
  let erroIntervalo = null;
  /* Pediu intervalo e alguma data nao passou na validacao (31/02, mes
     13...): sem view nenhuma. Cair no recorte do mes mostraria o mes
     inteiro com o rotulo de um periodo que nao existe. */
  if (pediuIntervalo) {
    if (!de || !ate) erroIntervalo = "datas invalidas";
    else {
      view =
        lembrar(agg, ["i", unit, JSON.stringify(de), JSON.stringify(ate), grupoOk], () =>
          agg.intervalo(unit, de, ate, grupoOk || undefined)
        ) || undefined;
      if (!view) erroIntervalo = "a data final e anterior a inicial";
    }
  } else {
    view = comRecebimentoOficial(recorteDe(agg, unit, year, month, grupoOk), snap, unit, year, month, grupoOk);
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
    headers: snap.snapshot.headers || agg.headers,
    years: snap.snapshot.years || agg.years || [],
    hoje: hojeDe(agg, unit, grupoOk) || null,
    semana: semanaDe(agg, unit, grupoOk) || null,
    clientesStatus: snap.snapshot.clientesStatus?.[unit] || null,
    erroIntervalo,
    view: view || null,
  };
}

async function ranking({ unit, periodo, ano, mes }) {
  const snap = await snapshot();
  const agg = await aggregado().catch(() => null);
  if (!snap || !agg) return { semDados: true };
  const view =
    periodo === "hoje"
      ? hojeDe(agg, unit)
      : periodo === "semana"
        ? semanaDe(agg, unit)
        : recorteDe(agg, unit, ano, periodo === "ano" ? "all" : mes);
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
    const agg = await aggregado();
    /* O que quase toda abertura do painel pede: o mes corrente, hoje e a
       semana de cada unidade. */
    if (agg) {
      const h = hojeBR();
      for (const u of ["matriz", "filial", "consolidado"]) {
        recorteDe(agg, u, h.y, h.m);
        hojeDe(agg, u);
        semanaDe(agg, u);
      }
    }
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
