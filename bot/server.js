import express from "express";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
const INTERVAL_MS = Number(process.env.SCRAPE_MS || 300000);

const app = express();
app.set("trust proxy", 1);
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.FRONTEND_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
let lastError = null;
let running = false;

async function loadSnapshot() {
  try {
    const raw = await readFile(join(DATA_DIR, "snapshot.json"), "utf8");
    return JSON.parse(raw);
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

app.get("/api/health", async (_req, res) => {
  const snap = await loadSnapshot();
  res.json({
    ok: true,
    running,
    lastError,
    at: snap?.at || null,
    rows: snap?.rows || 0,
  });
});

app.get("/api/caixa", async (_req, res) => {
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

app.get("/api/snapshot", async (req, res) => {
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
    view: view ? { ...view, dailyFat } : null,
  });
});

app.use(express.static(WEB_DIR));
app.get("*", (_req, res) => {
  res.sendFile(join(WEB_DIR, "index.html"));
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
