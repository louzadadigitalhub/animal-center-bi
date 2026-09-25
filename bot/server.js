import express from "express";
import { existsSync, readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fork } from "node:child_process";
import { Worker } from "node:worker_threads";
import {
  clearCookieHeader,
  clientIp,
  cookieHeader,
  loginPerson,
  trocarPin,
  photoFile,
  photoMap,
  publicStaff,
  readCookie,
  readSession,
  listPeople,
} from "./people.js";
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

/* ---------- Consultas pesadas, fora do fio das paginas ----------
   Snapshot, agregacao das 100 mil vendas e painel da vendedora moram
   na thread de consultas.js. Aqui fica so o pedido e a espera. */
let consultas = null;
let seqConsulta = 0;
const pendentes = new Map();

function iniciarConsultas() {
  consultas = new Worker(join(__dirname, "consultas.js"));
  consultas.on("message", ({ id, ok, r, erro }) => {
    const p = pendentes.get(id);
    if (!p) return;
    pendentes.delete(id);
    clearTimeout(p.t);
    if (ok) p.res(r);
    else p.rej(new Error(erro));
  });
  consultas.on("error", (err) => console.error(agoraBr(), "consultas fail", err?.message || err));
  consultas.on("exit", (code) => {
    for (const p of pendentes.values()) {
      clearTimeout(p.t);
      p.rej(new Error("a thread de consultas reiniciou"));
    }
    pendentes.clear();
    consultas = null;
    if (code !== 0) console.error(agoraBr(), "consultas saiu com codigo", code, "— reabrindo");
  });
}

function consultar(tipo, args = {}, limiteMs = 90000) {
  if (!consultas) iniciarConsultas();
  const id = ++seqConsulta;
  return new Promise((res, rej) => {
    const t = setTimeout(() => {
      pendentes.delete(id);
      rej(new Error(`consulta ${tipo} passou de ${limiteMs / 1000}s`));
    }, limiteMs);
    pendentes.set(id, { res, rej, t });
    consultas.postMessage({ id, tipo, args });
  });
}

/* O demonstrativo muda no ritmo da contabilidade, nao no das vendas, e
   ler as duas unidades custa dois logins. De 6 em 6 horas ja basta.
   Se falhar, tenta de novo em 20 minutos — antes tentava a cada ciclo de
   2 minutos, abrindo mais um Chromium toda vez, e isso ajudou a esgotar
   a memoria da VPS em 24/09. */
const DRE_MS = Number(process.env.DRE_MS || 6 * 60 * 60 * 1000);
const DRE_RETRY_MS = Number(process.env.DRE_RETRY_MS || 20 * 60 * 1000);
let proximoDre = 0;
/* O estado da coleta sai no /api/health. Antes o unico sinal era um
   console.error no log do container: quando o DRE falhou em producao a
   tela so ficou sem custo, sem dizer por que. */
let dreStatus = { at: null, ok: null, erro: null, unidades: [] };

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

/* Um ciclo completo nunca passou de uns 8 minutos nos logs. Acima de 20
   o robo esta preso — num goto que nao volta, num Chromium que nao fecha —
   e o servidor mata o processo em vez de esperar para sempre. Foi
   esperar para sempre o que aconteceu em 24/09. */
const ROBO_LIMITE_MS = Number(process.env.ROBO_LIMITE_MS || 20 * 60 * 1000);
let ultimoCicloOk = null;

function tick() {
  if (running) return;
  running = true;
  const querDre = Date.now() >= proximoDre;
  const inicio = Date.now();
  let respondeuScrape = false;
  let respondeuDre = false;

  /* execArgv vazio: o filho nao herda flags de debug do pai. ROBO_HEAP_MB
     limita a memoria do robo se a VPS voltar a apertar; sem ele vale o
     padrao do Node. */
  const execArgv = process.env.ROBO_HEAP_MB ? [`--max-old-space-size=${process.env.ROBO_HEAP_MB}`] : [];
  const filho = fork(join(__dirname, "robo.js"), [], {
    env: { ...process.env, ROBO_DRE: querDre ? "1" : "0" },
    execArgv,
    stdio: "inherit",
  });

  /* SIGTERM primeiro: o Playwright fecha o Chromium ao receber o sinal.
     Se em 30s o processo nao saiu, SIGKILL. */
  const vigia = setTimeout(() => {
    console.error(agoraBr(), `robo passou de ${Math.round(ROBO_LIMITE_MS / 60000)} min — encerrando`);
    filho.kill("SIGTERM");
    setTimeout(() => filho.exitCode === null && filho.kill("SIGKILL"), 30000).unref();
  }, ROBO_LIMITE_MS);

  filho.on("message", async (m) => {
    if (m?.tipo === "scrape") {
      respondeuScrape = true;
      if (m.ok) {
        const r = m.r || {};
        lastError = null;
        ultimoCicloOk = new Date().toISOString();
        estado = {
          at: r.at || estado.at,
          rows: r.rows || estado.rows,
          anos: r.anos || estado.anos,
          filialOk: Boolean(r.filialOk || r.filial),
          historico: estado.historico,
          perfis: estado.perfis,
        };
        await lerEspelho().catch(() => {});
        /* A primeira pessoa a abrir o painel depois da coleta nao paga o
           parse: a thread ja comeca a montar agora. */
        consultar("aquecer", {}, 300000).catch((e) => console.error("aquecer fail", e.message));
        console.log(agoraBr(), "scrape ok", r);
      } else {
        lastError = m.erro;
        console.error(agoraBr(), "scrape fail", m.erro);
      }
    }
    if (m?.tipo === "dre") {
      respondeuDre = true;
      dreStatus = { at: new Date().toISOString(), ok: m.ok, erro: m.erro || null, unidades: m.r?.unidades || [] };
      proximoDre = Date.now() + (m.ok ? DRE_MS : DRE_RETRY_MS);
      console[m.ok ? "log" : "error"]("dre", m.ok ? "ok" : "fail", m.ok ? m.r : m.erro);
    }
  });

  filho.on("exit", (code, sinal) => {
    clearTimeout(vigia);
    running = false;
    const min = ((Date.now() - inicio) / 60000).toFixed(1);
    if (!respondeuScrape) {
      lastError = `robo saiu sem responder (codigo ${code}, sinal ${sinal || "nenhum"}) depois de ${min} min`;
      console.error(agoraBr(), lastError);
    }
    /* Pediu DRE e o processo morreu antes de responder: nao fica
       tentando a cada ciclo. */
    if (querDre && !respondeuDre) proximoDre = Date.now() + DRE_RETRY_MS;
  });

  filho.on("error", (err) => {
    clearTimeout(vigia);
    running = false;
    lastError = `nao deu para abrir o robo: ${err.message}`;
    console.error(agoraBr(), lastError);
  });
}

function agoraBr() {
  return new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
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
  /* "O robo esta de pe?" precisa de resposta daqui de fora. Em 24/09 o
     processo congelou e a unica pista era a ausencia de linhas no log. */
  const semColetarMin = ultimoCicloOk ? Math.round((Date.now() - Date.parse(ultimoCicloOk)) / 60000) : null;
  const mem = process.memoryUsage();
  res.json({
    ok: true,
    running,
    ultimoCicloOk,
    semColetarMin,
    memoriaMb: { rss: Math.round(mem.rss / 1048576), heap: Math.round(mem.heapUsed / 1048576) },
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
  const r = await consultar("caixa").catch((e) => ({ semDados: true, erro: e.message }));
  if (r.semDados) return res.status(503).json({ ok: false, error: r.erro || "ainda sem dados" });
  res.json({ ok: true, ...r });
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
  try {
    const view = await consultar("pessoa", { nome: me.nome, year, month });
    res.json({ ok: true, me, view });
  } catch (err) {
    res.status(503).json({ ok: false, error: "os numeros ainda estao sendo montados, tente de novo", detalhe: err.message });
  }
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
  const unit = String(req.query.unit || "matriz");
  const periodo = String(req.query.periodo || "mes");
  const br = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const r = await consultar("ranking", { unit, periodo, ano: br.getFullYear(), mes: br.getMonth() }).catch(() => ({
    semDados: true,
  }));
  if (r.semDados) return res.status(503).json({ ok: false, error: "ainda sem dados" });
  const fotos = await photoMap().catch(() => ({}));
  res.json({ ok: true, at: r.at, rows: r.rows, fotos, ...(viewPublicaRanking(r.view) || {}) });
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
  const unit = String(req.query.unit || "matriz");
  const year = Number(req.query.year || 2026);
  const month = req.query.month === "all" ? "all" : Number(req.query.month ?? 8);
  const grupo = String(req.query.grupo || "");
  /* Datas validadas aqui, antes de pedir qualquer coisa a thread. */
  const de = dataDaTela(req.query.de);
  const ate = dataDaTela(req.query.ate);
  const pediuIntervalo = Boolean(req.query.de || req.query.ate);

  let r;
  try {
    r = await consultar("painel", {
      unit,
      year,
      month,
      grupo,
      pediuIntervalo,
      de,
      ate,
    });
  } catch (err) {
    return res.status(503).json({ ok: false, error: "os numeros ainda estao sendo montados", detalhe: err.message, lastError });
  }
  if (r.semDados) {
    return res.status(503).json({ ok: false, error: "ainda sem dados do SimplesVet", lastError });
  }
  const { view, receitasOficiais, ...resto } = r;
  let dreReal = null;
  if (!pediuIntervalo) {
    dreReal = await dreDoPortal(DATA_DIR, unit, year, month).catch(() => null);
    for (const parte of dreReal?.partes || []) parte.receita = receitasOficiais?.[parte.unit] || null;
  }
  res.json({
    ok: true,
    ...resto,
    /* O recorte sai do servidor ja podado: a conta que nao tem a aba
       Clientes nao recebe o array de clientes, nem o telefone deles.
       O DRE de verdade vem do demonstrativo do SimplesVet e passa pelo
       mesmo filtro — conta sem a aba DRE nao recebe custo nenhum. So
       existe por mes fechado, entao num recorte livre nao vai. */
    view: view
      ? filtrarView(
          {
            ...view,
            dreReal,
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
