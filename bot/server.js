import express from "express";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  clearCookieHeader,
  clientIp,
  cookieHeader,
  loginPerson,
  personDashboard,
  publicStaff,
  readCookie,
  readSession,
  syncPeopleFromSales,
} from "./people.js";
import { aggregate } from "./aggregate.js";
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

let hojeCache = { at: "", snap: null };

async function loadSnapshot() {
  try {
    const raw = await readFile(join(DATA_DIR, "snapshot.json"), "utf8");
    const snap = JSON.parse(raw);
    const filialVazia = !snap?.snapshot?.views?.filial;
    if (snap?.snapshot?.hoje && !filialVazia) {
      const temFilial = Object.values(snap.snapshot.views.filial || {}).some((ano) =>
        Object.values(ano || {}).some((v) => (v?.qtd || 0) > 0)
      );
      if (temFilial) return snap;
    }
    if (hojeCache.at === snap.at && hojeCache.snap) return hojeCache.snap;
    try {
      const rows = JSON.parse(await readFile(join(DATA_DIR, "vendas.json"), "utf8"));
      const agg = aggregate(rows);
      snap.snapshot.views = agg.views;
      snap.snapshot.hoje = agg.hoje;
      snap.snapshot.years = agg.years || snap.snapshot.years;
      hojeCache = { at: snap.at, snap };
    } catch {
      /* sem vendas.json ainda */
    }
    return snap;
  } catch {
    return null;
  }
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const { scrape } = await import("./scrape.js");
    const r = await scrape();
    lastError = null;
    console.log(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), "scrape ok", r);
  } catch (err) {
    lastError = String(err && err.stack ? err.stack : err);
    console.error(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }), "scrape fail", lastError);
  } finally {
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

app.get("/api/health", async (_req, res) => {
  const snap = await loadSnapshot();
  let espelho = null;
  try {
    espelho = JSON.parse(await readFile(join(DATA_DIR, "espelho.json"), "utf8"));
  } catch {
    /* ainda sem historico */
  }
  res.json({
    ok: true,
    running,
    lastError,
    at: snap?.at || null,
    rows: snap?.rows || 0,
    anos: snap?.snapshot?.years || espelho?.anos || [],
    filialOk: Boolean(espelho?.filialOk || snap?.caixa?.filial?.receitaTotal),
    historico: espelho?.historico || {},
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
    const { people } = await syncPeopleFromSales();
    res.json({ ok: true, staff: publicStaff(people) });
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
  res.json({ ok: true, at: snap.at, rows: snap.rows, ...(viewPublicaRanking(view) || {}) });
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
  const view = snap.snapshot.views[unit]?.[year]?.[month];
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
    hoje: snap.snapshot.hoje?.[unit] || null,
    semana: snap.snapshot.semana?.[unit] || null,
    clientesStatus: snap.snapshot.clientesStatus?.[unit] || null,
    /* O recorte sai do servidor ja podado: a conta que nao tem a aba
       Clientes nao recebe o array de clientes, nem o telefone deles. */
    view: view ? filtrarView({ ...view, dailyFat }, req.perfil.paginas) : null,
    paginas: req.perfil.paginas,
    admin: req.perfil.admin,
  });
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
