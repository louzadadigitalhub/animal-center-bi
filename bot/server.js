import express from "express";
import { existsSync, readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  clearCookieHeader,
  clientIp,
  cookieHeader,
  loginPerson,
  trocarPin,
  personDashboard,
  photoFile,
  photoMap,
  publicStaff,
  readCookie,
  readSession,
  syncPeopleFromSales,
  listPeople,
} from "./people.js";
import { aggregate, GRUPOS } from "./aggregate.js";
import { dreDoPortal, matrizAnual } from "./dre.js";
import { IDS, PAGINAS, filtrarView, listarPerfis, removerPerfil, salvarPerfil, viewPublicaRanking } from "./acesso.js";
import { authConfigurada, exigeDiretoria, quemE } from "./auth-diretoria.js";

process.on("uncaughtException", (err) => {
  console.error("uncaught", err);
});
process.on("unhandledRejection", (err) => {
  console.error("unhandled", err);
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    if (!line.includes("=") || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}
const DATA_DIR = process.env.DATA_DIR || join(__dirname, "..", "data");
const WEB_DIR = process.env.WEB_DIR || join(__dirname, "..", "web", "dist");
const PORT = Number(process.env.PORT || 8787);
const INTERVAL_MS = Number(process.env.SCRAPE_MS || 120000);

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((req, res, next) => {
  const origin = process.env.FRONTEND_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (origin !== "*") res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: "32kb" }));
const bootedAt = new Date().toISOString();
let lastError = null;
let running = false;
/* Espelho e um JSON pequeno (perfis, anos, filialOk). Health lia o
   snapshot inteiro (~dezenas de MB) e travava 25s no meio do scrape. */
let estado = { at: null, rows: 0, anos: [], filialOk: false, historico: {}, perfis: [] };

async function lerEspelho() {
  try {
    const e = JSON.parse(await readFile(join(DATA_DIR, "espelho.json"), "utf8"));
    estado = {
      at: e.at || estado.at,
      rows: Number(e.rows || estado.rows) || 0,
      anos: e.anos || estado.anos,
      filialOk: Boolean(
        e.filialOk || (e.perfis || []).some((p) => String(p).startsWith("filial:"))
      ),
      historico: e.historico || estado.historico,
      perfis: e.perfis || estado.perfis,
    };
  } catch {
    /* ainda sem historico */
  }
}

async function peekSnapshot() {
  let f;
  try {
    const { open } = await import("node:fs/promises");
    f = await open(join(DATA_DIR, "snapshot.json"));
    const buf = Buffer.alloc(1500);
    const { bytesRead } = await f.read(buf, 0, 1500, 0);
    const t = buf.toString("utf8", 0, bytesRead);
    return {
      at: t.match(/"at":"([^"]+)"/)?.[1] || "",
      rows: Number(t.match(/"rows":(\d+)/)?.[1] || 0),
    };
  } catch {
    return { at: "", rows: 0 };
  } finally {
    await f?.close().catch(() => {});
  }
}

async function metaSnapshot() {
  const p = await peekSnapshot();
  if (p.at && !estado.at) estado.at = p.at;
  if (p.rows && !estado.rows) estado.rows = p.rows;
}

lerEspelho().then(() => metaSnapshot()).catch(() => {});

let hojeCache = { at: "", snap: null };

async function loadSnapshot() {
  try {
    const peek = await peekSnapshot();
    if (peek.at && hojeCache.at === peek.at && hojeCache.snap) return hojeCache.snap;
    const raw = await readFile(join(DATA_DIR, "snapshot.json"), "utf8");
    const snap = JSON.parse(raw);
    const filialVazia = !snap?.snapshot?.views?.filial;
    const temFilial =
      !filialVazia &&
      Object.values(snap.snapshot.views.filial || {}).some((ano) =>
        Object.values(ano || {}).some((v) => (v?.qtd || 0) > 0)
      );
    if (snap?.snapshot?.hoje && temFilial) {
      hojeCache = { at: snap.at, snap };
      return snap;
    }
    try {
      const rows = JSON.parse(await readFile(join(DATA_DIR, "vendas.json"), "utf8"));
      const agg = aggregate(rows);
      snap.snapshot.views = agg.views;
      snap.snapshot.hoje = agg.hoje;
      snap.snapshot.years = agg.years || snap.snapshot.years;
    } catch {
      /* sem vendas.json ainda */
    }
    hojeCache = { at: snap.at, snap };
    return snap;
  } catch {
    return null;
  }
}

/* O demonstrativo muda no ritmo da contabilidade, nao no das vendas, e
   ler as duas unidades custa dois logins. De 6 em 6 horas ja basta, e
   sempre dentro do tick — o coletor faz logout para trocar de ambiente,
   entao rodando solto ele derrubaria a sessao do scrape no meio. */
const DRE_MS = Number(process.env.DRE_MS || 6 * 60 * 60 * 1000);
let ultimoDre = 0;
/* O estado da coleta sai no /api/status. Antes o unico sinal era um
   console.error no log do container: quando o DRE falhou em producao a
   tela so ficou sem custo, sem dizer por que. */
let dreStatus = { at: null, ok: null, erro: null, unidades: [] };

async function coletarDre() {
  if (Date.now() - ultimoDre <= DRE_MS) return;
  ultimoDre = Date.now();
  const agoraBr = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  try {
    const { collectDre } = await import("./collect-dre.js");
    const r = await collectDre(agoraBr.getFullYear(), DATA_DIR);
    dreStatus = { at: new Date().toISOString(), ok: true, erro: null, unidades: r.unidades };
    console.log("dre ok", r);
  } catch (err) {
    const erro = String(err?.message || err);
    dreStatus = { at: new Date().toISOString(), ok: false, erro, unidades: [] };
    console.error("dre fail", erro);
    /* Falhou: tenta de novo no proximo ciclo em vez de so daqui a seis
       horas. Sem isso, um erro pego logo no boot deixava o painel sem
       custo o resto do turno. */
    ultimoDre = 0;
  }
}

/* O aggregate custa caro (varre e reagrupa o historico inteiro), entao
   fica em memoria chaveado por mtime+tamanho do vendas.json, igual ao
   vendasParseadas. Sem isso, cada filtro de data reprocessaria tudo. */
let aggCache = { chave: "", agg: null };

async function aggregado() {
  const arq = join(DATA_DIR, "vendas.json");
  let chave;
  try {
    const st = await stat(arq);
    chave = `${st.mtimeMs}:${st.size}`;
  } catch {
    return null;
  }
  if (aggCache.chave === chave) return aggCache.agg;
  const rows = JSON.parse(await readFile(arq, "utf8"));
  const agg = aggregate(rows);
  aggCache = { chave, agg };
  return agg;
}

/* "2026-09-01" -> {y,m,d}. Recusa o que nao for exatamente uma data. */
function dataDaTela(txt) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(txt || ""));
  if (!m) return null;
  const y = Number(m[1]);
  const mes = Number(m[2]);
  const d = Number(m[3]);
  if (mes < 1 || mes > 12 || d < 1 || d > 31) return null;
  /* Date normaliza 31/02 para 03/03; comparar de volta pega isso. */
  const t = new Date(Date.UTC(y, mes - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() + 1 !== mes || t.getUTCDate() !== d) return null;
  return { y, m: mes, d };
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const { scrape } = await import("./scrape.js");
    const r = await scrape();
    lastError = null;
    estado = {
      at: r.at || estado.at,
      rows: r.rows || estado.rows,
      anos: r.anos || estado.anos,
      filialOk: Boolean(r.filialOk || r.filial),
      historico: estado.historico,
      perfis: estado.perfis,
    };
    hojeCache = { at: "", snap: null };
    await lerEspelho().catch(() => {});
    console.log(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), "scrape ok", r);
    /* Gente nova aparece aqui, no ciclo, e nao quando alguem abre a tela
       de login. Este sync relê e reprocessa o historico inteiro. */
    await syncPeopleFromSales().catch((e) => console.error("sync gente fail", String(e?.message || e)));
  } catch (err) {
    lastError = String(err && err.stack ? err.stack : err);
    console.error(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), "scrape fail", lastError);
  } finally {
    /* Fora do try do scrape: o demonstrativo nao depende das vendas.
       Se o login do SimplesVet caiu, o DRE usa a mesma porta e so
       duplicaria o erro. */
    const loginMorto = lastError && /login\.php|Timeout \d+ms exceeded|net::ERR|SIMPLES_VET_EMAIL/i.test(lastError);
    if (!loginMorto) await coletarDre().catch(() => {});
    running = false;
  }
}

/* A string fixa nao dizia nada sobre o que estava no ar de fato. O nome do
   bundle carrega hash do conteudo e muda a cada build, entao serve para
   saber se um deploy realmente pegou. */
let assetCache = null;
function assetAtual() {
  if (assetCache) return assetCache;
  try {
    const html = readFileSync(join(WEB_DIR, "index.html"), "utf8");
    assetCache = html.match(/assets\/(index-[\w-]+\.js)/)?.[1] || "desconhecido";
  } catch {
    assetCache = "sem build";
  }
  return assetCache;
}

app.get("/api/version", (_req, res) => {
  res.json({
    v: "grafico-20260912c",
    build: process.env.BUILD_MARK || null,
    asset: assetAtual(),
    subiuEm: bootedAt,
    tz: "America/Sao_Paulo",
  });
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    running,
    lastError,
    at: estado.at,
    rows: estado.rows,
    anos: estado.anos,
    filialOk: estado.filialOk,
    dre: dreStatus,
    historico: estado.historico,
    perfis: estado.perfis,
  });
});

app.get("/api/espelho", exigeDiretoria(), async (_req, res) => {
  try {
    const e = JSON.parse(await readFile(join(DATA_DIR, "espelho.json"), "utf8"));
    res.json({ ok: true, ...e });
  } catch {
    res.status(503).json({ ok: false, error: "ainda sem espelho" });
  }
});

app.get("/api/caixa", exigeDiretoria(), async (_req, res) => {
  const snap = await loadSnapshot();
  if (!snap) return res.status(503).json({ ok: false, error: "ainda sem dados" });
  res.json({
    ok: true,
    at: snap.at,
    from: snap.from,
    to: snap.to,
    caixa: snap.caixa || snap.snapshot?.caixaOficial || null,
  });
});

app.get("/api/auth/staff", async (_req, res) => {
  try {
    res.json({ ok: true, staff: publicStaff(await listPeople()) });
  } catch (err) {
    res.status(500).json({ ok: false, error: "nao deu para listar o time" });
    console.error("staff fail", err);
  }
});

app.post("/api/auth/login", async (req, res) => {
  const id = String(req.body?.id || "");
  const pin = String(req.body?.pin || "");
  const result = await loginPerson(id, pin, clientIp(req));
  if (!result.ok) return res.status(result.status).json({ ok: false, error: result.error });
  res.setHeader("Set-Cookie", cookieHeader(result.token, req));
  res.json({ ok: true, me: result.me });
});

app.post("/api/auth/logout", (_req, res) => {
  res.setHeader("Set-Cookie", clearCookieHeader());
  res.json({ ok: true });
});

app.get("/api/me", async (req, res) => {
  const me = await readSession(readCookie(req));
  if (!me) return res.status(401).json({ ok: false, error: "entre com seu PIN" });
  res.json({ ok: true, me });
});

app.get("/api/me/dashboard", async (req, res) => {
  const me = await readSession(readCookie(req));
  if (!me) return res.status(401).json({ ok: false, error: "entre com seu PIN" });
  const now = new Date();
  const br = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const year = Number(req.query.year || br.getFullYear());
  const monthRaw = req.query.month;
  const month = monthRaw === "all" ? "all" : Number(monthRaw ?? br.getMonth());
  if (!Number.isFinite(year) || year < 2020 || year > 2100) {
    return res.status(400).json({ ok: false, error: "ano invalido" });
  }
  if (month !== "all" && (!Number.isFinite(month) || month < 0 || month > 11)) {
    return res.status(400).json({ ok: false, error: "mes invalido" });
  }
  const view = await personDashboard(me.nome, year, month);
  res.json({ ok: true, me, view });
});

/* Foto da equipe. Publica de proposito: o telao do corredor nao tem login e
   precisa mostrar o rosto no podio. E so isso — nenhum dado de tutor passa
   por aqui, e o tipo sai do conteudo do arquivo, nao do que o cliente pede. */
app.get("/api/foto/:id", async (req, res) => {
  const info = await photoFile(String(req.params.id || ""));
  if (!info) return res.status(404).json({ ok: false, error: "sem foto" });
  res.setHeader("Content-Type", info.type);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", "inline");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.sendFile(info.path);
});

/* Telao do corredor: sem login, e por isso sem nada de tutor. Se a TV
   continuasse chamando /api/snapshot, trancar a tela nao adiantaria nada —
   a URL aberta entregaria os 221 telefones do mesmo jeito. */
/* O Vite embute VITE_* no build, mas o EasyPanel injeta variavel em runtime:
   o build dentro do container nao as veria e o front acharia que o Supabase
   nao esta configurado. Entregar a configuracao por aqui desacopla o build
   do ambiente — a mesma imagem serve qualquer projeto.
   A chave publishable e publica por desenho; a secret nunca sai daqui. */
app.get("/api/config", (_req, res) => {
  res.json({
    ok: true,
    supabaseUrl: process.env.SUPABASE_URL || "",
    supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "",
  });
});

app.get("/api/ranking", async (req, res) => {
  const snap = await loadSnapshot();
  if (!snap?.snapshot?.views) return res.status(503).json({ ok: false, error: "ainda sem dados" });
  const unit = String(req.query.unit || "matriz");
  const periodo = String(req.query.periodo || "mes");
  const br = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const view =
    periodo === "hoje"
      ? snap.snapshot.hoje?.[unit]
      : periodo === "semana"
        ? snap.snapshot.semana?.[unit]
        : snap.snapshot.views[unit]?.[br.getFullYear()]?.[periodo === "ano" ? "all" : br.getMonth()];
  const fotos = await photoMap().catch(() => ({}));
  res.json({ ok: true, at: snap.at, rows: snap.rows, fotos, ...(viewPublicaRanking(view) || {}) });
});

/* Quem sou eu e o que posso ver. A tela usa para montar o menu; o servidor
   nao confia nisso — o filtro de dado acontece no /api/snapshot. */
app.get("/api/perfil", async (req, res) => {
  if (!authConfigurada()) {
    return res.status(503).json({ ok: false, error: "painel sem autenticacao configurada" });
  }
  const perfil = await quemE(req);
  if (!perfil) return res.status(401).json({ ok: false, error: "entre para ver o painel" });
  res.json({ ok: true, perfil, paginas: PAGINAS });
});

/* Trocar o PIN de alguem do time. So a admin.

   O PIN volta em claro nesta resposta e em nenhum outro lugar: o disco
   guarda so o hash. Se a admin fechar a tela sem copiar, nao ha como
   recuperar — tem que gerar outro. E de proposito; e a mesma razao pela
   qual o Supabase nao mostra a senha dela. */
app.post("/api/equipe/pin", exigeDiretoria({ admin: true }), async (req, res) => {
  const id = String(req.body?.id || "");
  const pin = String(req.body?.pin || "");
  if (!id) return res.status(400).json({ ok: false, error: "falta dizer de quem" });
  const r = await trocarPin(id, pin);
  if (!r.ok) return res.status(r.status || 400).json({ ok: false, error: r.error });
  console.log("pin trocado", id, "por", req.perfil.email);
  res.json({ ok: true, pin: r.pin, nome: r.nome });
});

app.get("/api/perfis", exigeDiretoria({ admin: true }), async (_req, res) => {
  res.json({ ok: true, perfis: await listarPerfis(), paginas: PAGINAS });
});

app.post("/api/perfis", exigeDiretoria({ admin: true }), async (req, res) => {
  const email = String(req.body?.email || "");
  const paginas = req.body?.paginas;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: "email invalido" });
  }
  const r = await salvarPerfil(email, paginas === "todas" ? "todas" : paginas);
  if (!r.ok) return res.status(400).json(r);
  res.json({ ok: true, perfis: await listarPerfis() });
});

app.delete("/api/perfis", exigeDiretoria({ admin: true }), async (req, res) => {
  const r = await removerPerfil(String(req.body?.email || ""));
  if (!r.ok) return res.status(400).json(r);
  res.json({ ok: true, perfis: await listarPerfis() });
});

/* Convite. A chave de servico do Supabase cria contas e NAO pode ir para o
   navegador, entao a chamada sai daqui. Sem ela configurada, a admin ainda
   pode liberar abas de quem ja tem conta — so nao cria conta nova pelo painel. */
app.post("/api/perfis/convidar", exigeDiretoria({ admin: true }), async (req, res) => {
  const chave = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  if (!chave) {
    return res.status(503).json({ ok: false, error: "convite indisponivel: falta SUPABASE_SECRET_KEY" });
  }
  const email = String(req.body?.email || "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: "email invalido" });
  }
  try {
    const r = await fetch(`${url}/auth/v1/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: chave, Authorization: `Bearer ${chave}` },
      body: JSON.stringify({ email }),
    });
    if (!r.ok) {
      const t = await r.text();
      return res.status(400).json({ ok: false, error: `Supabase recusou: ${t.slice(0, 160)}` });
    }
    await salvarPerfil(email, Array.isArray(req.body?.paginas) ? req.body.paginas : []);
    res.json({ ok: true, perfis: await listarPerfis() });
  } catch (err) {
    console.error("convite", err);
    res.status(502).json({ ok: false, error: "nao deu para falar com o Supabase" });
  }
});

app.get("/api/snapshot", exigeDiretoria(), async (req, res) => {
  const snap = await loadSnapshot();
  if (!snap?.snapshot?.views) {
    res.status(503).json({ ok: false, error: "ainda sem dados do SimplesVet", lastError });
    return;
  }
  const unit = String(req.query.unit || "matriz");
  const year = Number(req.query.year || 2026);
  const month = req.query.month === "all" ? "all" : Number(req.query.month ?? 8);
  const grupoQ = String(req.query.grupo || "");
  const grupoOk = GRUPOS.includes(grupoQ) ? grupoQ : "";

  /* Recorte livre e filtro de grupo nao cabem no snapshot pre-calculado
     (ele so guarda mes e ano, com todos os grupos juntos). Os dois saem
     do aggregate em cache, que ja leu vendas.json. */
  const de = dataDaTela(req.query.de);
  const ate = dataDaTela(req.query.ate);
  let view;
  let erroIntervalo = null;
  const agg = await aggregado().catch(() => null);
  if (req.query.de || req.query.ate) {
    if (!de || !ate) erroIntervalo = "datas invalidas";
    else {
      view = agg?.intervalo(unit, de, ate, grupoOk || undefined) || undefined;
      if (!view) erroIntervalo = "a data final e anterior a inicial";
    }
  } else if (agg) {
    view = agg.recorte(unit, year, month, grupoOk);
  } else {
    view = snap.snapshot.views[unit]?.[year]?.[month];
  }
  const cap = Math.max(Number(view?.caixa?.receitaTotal || view?.fat) || 0, 1);
  const dailyFat = (view?.dailyFat || []).map((row) => {
    let fat = Number(row.fat) || 0;
    while (cap > 1 && fat > cap && fat >= 100) fat /= 100;
    if (fat > 10000000) fat = 0;
    return { d: row.d, fat: Math.round(fat) };
  });
  res.json({
    ok: true,
    at: snap.at,
    from: snap.from,
    to: snap.to,
    rows: snap.rows,
    headers: snap.snapshot.headers,
    years: snap.snapshot.years || [],
    hoje: (agg ? agg.hojeDe(unit, grupoOk) : snap.snapshot.hoje?.[unit]) || null,
    semana: (agg ? agg.semanaDe(unit, grupoOk) : snap.snapshot.semana?.[unit]) || null,
    clientesStatus: snap.snapshot.clientesStatus?.[unit] || null,
    /* O recorte sai do servidor ja podado: a conta que nao tem a aba
       Clientes nao recebe o array de clientes, nem o telefone deles. */
    /* O DRE de verdade vem do demonstrativo do SimplesVet, nao do nosso
       agregador: as linhas de custo nunca estiveram nas vendas. Entra
       aqui e passa pelo filtrarView como todo o resto — conta sem a aba
       DRE nao recebe custo nenhum. */
    erroIntervalo,
    /* O demonstrativo do SimplesVet so existe por mes fechado, entao num
       recorte livre ele nao vai: a aba DRE avisa em vez de mostrar um
       numero que nao corresponde ao intervalo pedido. */
    view: view
      ? filtrarView(
          {
            ...view,
            dailyFat,
            dreReal: de ? null : await dreDoPortal(DATA_DIR, unit, year, month).catch(() => null),
          },
          req.perfil.paginas
        )
      : null,
    fotos: await photoMap().catch(() => ({})),
    paginas: req.perfil.paginas,
    admin: req.perfil.admin,
  });
});

/* A planilha para o contador. Ano inteiro, nao o mes da tela: quem fecha
   exercicio quer as doze colunas de uma vez. Exige a aba DRE — sem isso
   bastaria saber a URL para baixar o custo da clinica. */
app.get("/api/dre.xlsx", exigeDiretoria({ pagina: "dre" }), async (req, res) => {
  const unit = String(req.query.unit || "matriz");
  const year = Number(req.query.year) || new Date().getFullYear();
  const matriz = await matrizAnual(DATA_DIR, unit, year).catch(() => null);
  if (!matriz) {
    return res.status(404).json({ ok: false, error: "ainda sem demonstrativo para esse ano" });
  }
  const { planilhaDre } = await import("./dre-export.js");
  const buf = await planilhaDre(matriz);
  const nome = `DRE-${unit === "consolidado" ? "as-duas" : unit}-${year}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
  res.send(Buffer.from(buf));
});

app.use(express.static(WEB_DIR));
app.get("*", (_req, res) => {
  res.sendFile(join(WEB_DIR, "index.html"));
});

app.use((err, _req, res, _next) => {
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ ok: false, error: "imagem acima de 3 MB" });
  }
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ ok: false, error: "corpo invalido" });
  }
  console.error("http", err);
  res.status(500).json({ ok: false, error: "erro interno" });
});

console.log("boot", { port: PORT, data: DATA_DIR, web: WEB_DIR });

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log("listening", PORT);
  if (process.env.SKIP_SCRAPE === "1") {
    console.log("scrape desligado (SKIP_SCRAPE=1)");
    return;
  }
  if (!process.env.SIMPLES_VET_EMAIL || !process.env.SIMPLES_VET_PASSWORD) {
    console.warn("scrape desligado: SIMPLES_VET_EMAIL/PASSWORD ausentes");
    return;
  }
  tick();
  setInterval(tick, INTERVAL_MS);
});
server.on("error", (err) => {
  console.error("listen fail", err);
  process.exit(1);
});
