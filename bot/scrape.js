import { chromium } from "playwright";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { aggregate } from "./aggregate.js";

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

const EMAIL = process.env.SIMPLES_VET_EMAIL;
const PASSWORD = process.env.SIMPLES_VET_PASSWORD;
const LOGIN_URL = process.env.SIMPLES_VET_LOGIN_URL || "https://app.simples.vet/login/login.php";

const TZ = process.env.TZ || "America/Sao_Paulo";

function nowBrasilia(d = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  );
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour),
    min: Number(parts.minute),
    s: Number(parts.second),
  };
}

function todayBR() {
  const p = nowBrasilia();
  return `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${p.y}`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let q = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ";" || ch === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n") {
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c));
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.replace(/\s+/g, " ").trim());
  return rows.slice(1).map((r) => {
    const o = {};
    headers.forEach((h, i) => {
      o[h] = r[i] || "";
    });
    return o;
  });
}

async function setDateRange(page, from, to) {
  await page.evaluate(
    ({ from, to }) => {
      const hidden = document.getElementById("p__ven_dat_data") || document.getElementById("p__vba_dat_baixa");
      const span = document.querySelector("#p__ven_dat_data_text span, #p__vba_dat_baixa_text span");
      if (hidden) hidden.value = `${from}-${to}`;
      if (span) span.textContent = `${from} até ${to}`;
    },
    { from, to }
  );
}

function monthStartBR() {
  const p = nowBrasilia();
  return `01/${String(p.m).padStart(2, "0")}/${p.y}`;
}

function monthEndBR() {
  const p = nowBrasilia();
  const last = new Date(Date.UTC(p.y, p.m, 0)).getUTCDate();
  return `${String(last).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${p.y}`;
}

function agoraBrasiliaIso(d = new Date()) {
  const p = nowBrasilia(d);
  const pad = (n) => String(n).padStart(2, "0");
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.min)}:${pad(p.s)}-03:00`;
}

function moneyBR(s) {
  if (typeof s === "number" && Number.isFinite(s)) return s;
  const t = String(s || "").replace(/[R$\s]/g, "").trim();
  if (!t) return 0;
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? n : 0;
}

async function logout(page) {
  await page.goto("https://app.simples.vet/login/logout.php", { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(800);
}

async function submitLoginForm(page) {
  const emailBox = page.locator('input[type="email"], input[placeholder="Email"]').first();
  if (!(await emailBox.count()) || !(await emailBox.isVisible())) return;
  await emailBox.fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole("button", { name: /Entrar no SimplesVet/i }).click();
  await page.waitForTimeout(2500);
}

async function login(page, ambId = "") {
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  if (await page.locator("text=Painel de controle").count()) {
    if (!ambId) return;
    await logout(page);
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  }
  await submitLoginForm(page);
  const cards = page.locator("#ambientes .celx");
  await page.waitForTimeout(500);
  if (await cards.count()) {
    if (ambId) {
      const alvo = page.locator(`#ambientes .celx[data-id="${ambId}"]`);
      if (await alvo.count()) await alvo.click();
      else await cards.first().click();
    } else {
      await cards.first().click();
    }
  }
  await page.waitForSelector("text=Painel de controle", { timeout: 45000 });
}

async function listPerfisLogin(page) {
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  if (await page.locator("text=Painel de controle").count()) {
    await logout(page);
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  }
  await submitLoginForm(page);
  await page.locator("#ambientes .celx").first().waitFor({ timeout: 15000 }).catch(() => {});
  return page.evaluate(() =>
    [...document.querySelectorAll("#ambientes .celx")].map((el) => ({
      id: el.getAttribute("data-id") || "",
      nome: (el.querySelector("h4")?.innerText || "").trim(),
    })).filter((x) => x.id)
  );
}

const FILIAL_USER_ID = process.env.SIMPLES_VET_FILIAL_USER_ID || "306237";

async function scrapeRecebimentos(page, from, to, userId = "") {
  await page.goto("https://app.simples.vet/consulta/recebimento/recebimento.php", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("#p__vba_dat_baixa_text", { timeout: 30000 });
  await page.evaluate(
    ({ from, to, userId }) => {
      const hidden = document.getElementById("p__vba_dat_baixa");
      const span = document.querySelector("#p__vba_dat_baixa_text span");
      if (hidden) hidden.value = `${from}-${to}`;
      if (span) span.textContent = `${from} até ${to}`;
      const sel = document.getElementById("p__usu_int_codigo");
      if (sel) sel.value = userId || "";
      if (window.jQuery && window.jQuery.fn.select2) {
        window.jQuery("#p__usu_int_codigo").select2("val", userId || "");
      }
    },
    { from, to, userId }
  );
  await Promise.all([
    page.waitForLoadState("domcontentloaded"),
    page.locator("#p__btn_filtrar").click(),
  ]);
  await page.waitForSelector(".dashboard-stat .number", { timeout: 30000 });
  await page.waitForTimeout(1200);

  const extracted = await page.evaluate(() => {
    const cards = {};
    for (const el of document.querySelectorAll(".dashboard-stat")) {
      const label = (el.querySelector(".desc")?.getAttribute("data-desc") || el.querySelector(".desc")?.innerText || "").trim();
      const value = (el.querySelector(".number")?.innerText || "").trim();
      if (label) cards[label] = value;
    }
    const tableByCaption = (caption) => {
      const cap = [...document.querySelectorAll(".portlet-title .caption span")].find((s) => s.innerText.trim() === caption);
      if (!cap) return [];
      const table = cap.closest(".portlet")?.querySelector("table");
      if (!table) return [];
      return [...table.querySelectorAll("tbody tr")].map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.trim()));
    };
    return {
      period: document.querySelector("#p__vba_dat_baixa")?.value || "",
      cards,
      porUsuario: tableByCaption("Usuário que realizou a baixa"),
      porDia: tableByCaption("Data de baixa"),
      porForma: tableByCaption("Formas de recebimento"),
    };
  });

  const n = (s) => moneyBR(s);
  const dailyMap = {};
  for (const row of extracted.porDia || []) {
    const date = row.find((c) => /^\d{1,2}\/\d{1,2}/.test(c)) || "";
    const val = moneyBR(row.find((c) => /[\d\.]+,\d{2}/.test(c)) || "0");
    if (!date) continue;
    dailyMap[date] = (dailyMap[date] || 0) + val;
  }
  const daily = Object.entries(dailyMap).map(([date, money]) => ({ date, money }));

  return {
    noDia: n(extracted.cards["Baixas no dia de venda"]),
    posteriores: n(extracted.cards["Baixas posteriores à venda"]),
    adiantamento: n(extracted.cards["Adiantamento de clientes"]),
    receitaTotal: n(extracted.cards["Receita total"]),
    emAberto: n(extracted.cards["Em aberto"]),
    daily,
    porUsuario: extracted.porUsuario,
    porForma: extracted.porForma,
    period: extracted.period,
    url: page.url(),
    userId: userId || "todos",
  };
}

function caixaPack(caixa) {
  return {
    noDia: Math.round(caixa.noDia || 0),
    posteriores: Math.round(caixa.posteriores || 0),
    adiantamento: Math.round(caixa.adiantamento || 0),
    receitaTotal: Math.round(caixa.receitaTotal || 0),
    emAberto: Math.round(caixa.emAberto || 0),
  };
}

function dailyFromCaixa(caixa, year, month) {
  const byDay = {};
  for (const row of caixa.daily || []) {
    const dm = String(row.date).match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (!dm) continue;
    const d = Number(dm[1]);
    const val = moneyBR(row.money);
    if (val) byDay[d] = (byDay[d] || 0) + val;
  }
  const daysIn = new Date(year, month + 1, 0).getDate();
  const dailyFat = [];
  for (let d = 1; d <= daysIn; d++) dailyFat.push({ d, fat: Math.round(byDay[d] || 0) });
  return dailyFat;
}

function applyRecebimentos(snapshot, caixa, from, unit) {
  if (!caixa || !caixa.receitaTotal) return snapshot;
  const m = String(from).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return snapshot;
  const month = Number(m[2]) - 1;
  const year = Number(m[3]);
  const pack = caixaPack(caixa);
  const dailyFat = dailyFromCaixa(caixa, year, month);
  const view = snapshot.views?.[unit]?.[year]?.[month];
  if (view) {
    view.caixa = pack;
    view.fat = pack.receitaTotal;
    view.recebido = pack.receitaTotal;
    if (dailyFat.some((d) => d.fat)) view.dailyFat = dailyFat;
  }
  snapshot.caixaOficial = snapshot.caixaOficial || {};
  snapshot.caixaOficial[unit] = { ...pack, url: caixa.url, at: agoraBrasiliaIso(), period: caixa.period };
  return snapshot;
}

function subCaixa(a, b) {
  const keys = ["noDia", "posteriores", "adiantamento", "receitaTotal", "emAberto"];
  const out = {};
  for (const k of keys) out[k] = Math.max(0, Math.round((a?.[k] || 0) - (b?.[k] || 0)));
  return out;
}

function findChrome() {
  const roots = [
    process.env.PLAYWRIGHT_CHROMIUM_PATH,
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    "/ms-playwright",
    "/root/.cache/ms-playwright",
    "/home/pwuser/.cache/ms-playwright",
  ].filter(Boolean);
  const names = ["headless_shell", "chrome", "chromium"];
  const walk = (dir, depth = 0) => {
    if (!dir || !existsSync(dir) || depth > 5) return null;
    try {
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, ent.name);
        if (ent.isFile() && names.includes(ent.name)) return p;
        if (ent.isDirectory()) {
          const hit = walk(p, depth + 1);
          if (hit) return hit;
        }
      }
    } catch {
      return null;
    }
    return null;
  };
  for (const root of roots) {
    if (existsSync(root) && names.some((n) => root.endsWith("/" + n))) return root;
    const hit = walk(root);
    if (hit) return hit;
  }
  return null;
}

async function exportVendas(page, from, to) {
  await page.goto("https://app.simples.vet/principal/venda/venda.php", {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("#filter", { timeout: 30000 });
  await setDateRange(page, from, to);
  await page.locator("#p__btn_filtrar").click();
  await page.waitForTimeout(2500);
  await page.locator("#p__btn_relatorio").click({ force: true });
  await page.waitForTimeout(400);
  const popupPromise = page.waitForEvent("popup", { timeout: 90000 }).catch(() => null);
  const downloadPromise = page.waitForEvent("download", { timeout: 90000 }).catch(() => null);
  await page.locator('a.p__btn_exportar[rel="xls_vendas"]').click({ force: true });
  let text = "";
  const download = await downloadPromise;
  if (download) {
    const p = join(DATA_DIR, "vendas-raw.csv");
    await download.saveAs(p);
    const { readFile } = await import("node:fs/promises");
    const buf = await readFile(p);
    const latin = buf.toString("latin1");
    const utf8 = buf.toString("utf8");
    text = (latin.match(/Grupo/g) || []).length >= (utf8.match(/Grupo/g) || []).length ? latin : utf8;
    if (!text.includes(";") && !text.includes(",")) text = utf8;
  } else {
    const popup = await popupPromise;
    if (popup) {
      await popup.waitForLoadState("domcontentloaded");
      text = await popup.evaluate(() => document.body.innerText);
      await popup.close();
    }
  }
  if (!text) throw new Error("Export vazio " + from + "-" + to);
  return rowsToObjects(parseCsv(text));
}

function sedeFromNome(nome) {
  const n = String(nome || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/cristovao|filial/.test(n)) return "filial";
  return "matriz";
}

function yearOfRow(row) {
  const m = String(row["Data e hora"] || row["Data baixa"] || "").match(/\/(\d{4})/);
  return m ? Number(m[1]) : 0;
}

async function listAmbientes(page) {
  return page.evaluate(async () => {
    const links = [...document.querySelectorAll("a.alterarAmbiente, .alterarAmbiente")].map((a) => ({
      id: String(a.id || ""),
      nome: (a.innerText || a.getAttribute("title") || "").replace(/\s+/g, " ").trim(),
    })).filter((x) => x.id);
    let api = "";
    try {
      const res = await fetch("/login/crud.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "acao=listarAmbientes",
        credentials: "same-origin",
      });
      api = await res.text();
    } catch (e) {
      api = String(e);
    }
    return { links, api: api.slice(0, 4000), user: (document.querySelector(".username")?.innerText || "").replace(/\s+/g, " ").trim() };
  });
}

async function switchAmbiente(page, id) {
  if (!id) return;
  await page.evaluate(async (id) => {
    await fetch("/login/crud.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "acao=alterarAmbiente&uam_int_codigo=" + encodeURIComponent(id),
      credentials: "same-origin",
    });
  }, id);
  await page.waitForTimeout(1000);
}

async function exportVendasYear(page, y, histTo) {
  const nowY = nowBrasilia().y;
  const f = `01/01/${y}`;
  const t = y === nowY ? histTo : `31/12/${y}`;
  try {
    const chunk = await exportVendas(page, f, t);
    if (chunk.length) return chunk;
  } catch (err) {
    console.warn("vendas ano inteiro falhou", y, err.message || err);
  }
  const a = await exportVendas(page, f, `30/06/${y}`).catch((e) => {
    console.warn("vendas H1", y, e.message || e);
    return [];
  });
  const b = await exportVendas(page, `01/07/${y}`, t).catch((e) => {
    console.warn("vendas H2", y, e.message || e);
    return [];
  });
  return [...a, ...b];
}

export async function scrape({ from, to } = {}) {
  const pNow = nowBrasilia();
  const histFrom = from || `01/01/${pNow.y - 3}`;
  const histTo = to || monthEndBR();
  const caixaFrom = monthStartBR();
  const caixaTo = monthEndBR();
  if (!EMAIL || !PASSWORD) throw new Error("SIMPLES_VET_EMAIL/PASSWORD ausentes");

  const executablePath = findChrome() || undefined;
  if (executablePath) console.log("chrome", executablePath);
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    acceptDownloads: true,
    locale: "pt-BR",
    timezoneId: TZ,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  try {
    const perfis = await listPerfisLogin(page);
    console.log("perfis login", JSON.stringify(perfis));
    let sedes = perfis.map((p) => ({
      id: p.id,
      nome: p.nome,
      unit: sedeFromNome(p.nome),
    }));
    if (!sedes.some((s) => s.unit === "filial") && sedes.length === 2) {
      sedes[1].unit = "filial";
    }
    if (!sedes.length) sedes = [{ id: "34969", nome: "Animal Center", unit: "matriz" }];
    console.log(
      "sedes",
      sedes.map((s) => s.unit + ":" + s.nome + ":" + s.id).join(" | ")
    );

    let objects = [];
    try {
      objects = JSON.parse(await readFile(join(DATA_DIR, "vendas.json"), "utf8"));
      if (!Array.isArray(objects)) objects = [];
    } catch {
      objects = [];
    }

    const startY = Number(String(histFrom).slice(-4)) || pNow.y - 3;
    for (const sede of sedes) {
      await logout(page);
      await login(page, sede.id);
      for (let y = startY; y <= pNow.y; y++) {
        const chunk = await exportVendasYear(page, y, histTo);
        console.log("vendas", sede.unit, y, chunk.length);
        if (!chunk.length) continue;
        objects = objects.filter((r) => !(yearOfRow(r) === y && (r._sede || "matriz") === sede.unit));
        const tagged = sedes.length > 1 ? chunk.map((r) => ({ ...r, _sede: sede.unit })) : chunk;
        objects.push(...tagged);
      }
    }
    if (!objects.length) throw new Error("Export nao veio (csv vazio).");
    let snapshot = aggregate(objects);
    const caixaByUnit = {};
    for (const sede of sedes) {
      try {
        await logout(page);
        await login(page, sede.id);
        const cx = await scrapeRecebimentos(page, caixaFrom, caixaTo, "");
        caixaByUnit[sede.unit] = cx;
        snapshot = applyRecebimentos(snapshot, cx, caixaFrom, sede.unit);
      } catch (err) {
        console.warn("recebimentos", sede.unit, err);
      }
    }
    const caixaTodos = caixaByUnit.matriz && caixaByUnit.filial
      ? {
          ...caixaByUnit.matriz,
          noDia: (caixaByUnit.matriz.noDia || 0) + (caixaByUnit.filial.noDia || 0),
          posteriores: (caixaByUnit.matriz.posteriores || 0) + (caixaByUnit.filial.posteriores || 0),
          adiantamento: (caixaByUnit.matriz.adiantamento || 0) + (caixaByUnit.filial.adiantamento || 0),
          receitaTotal: (caixaByUnit.matriz.receitaTotal || 0) + (caixaByUnit.filial.receitaTotal || 0),
          emAberto: (caixaByUnit.matriz.emAberto || 0) + (caixaByUnit.filial.emAberto || 0),
        }
      : caixaByUnit.matriz || caixaByUnit.filial || null;
    if (caixaTodos) snapshot = applyRecebimentos(snapshot, caixaTodos, caixaFrom, "consolidado");
    if (caixaByUnit.matriz && !caixaByUnit.filial) {
      snapshot = applyRecebimentos(snapshot, caixaByUnit.matriz, caixaFrom, "matriz");
    }
    const caixaFilial = caixaByUnit.filial || null;
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(join(DATA_DIR, "vendas.json"), JSON.stringify(objects, null, 0));
    try {
      const { mergeSalesHistory } = await import("./people.js");
      await mergeSalesHistory(objects);
    } catch (err) {
      console.warn("historico pessoas falhou", err);
    }
    await writeFile(
      join(DATA_DIR, "snapshot.json"),
      JSON.stringify(
        {
          ok: true,
          at: agoraBrasiliaIso(),
          from: histFrom,
          to: histTo,
          rows: objects.length,
          snapshot,
          caixa: {
            consolidado: caixaTodos ? caixaPack(caixaTodos) : null,
            filial: caixaFilial ? caixaPack(caixaFilial) : null,
            matriz: snapshot.caixaOficial?.matriz || null,
          },
        },
        null,
        0
      )
    );
    await writeFile(join(DATA_DIR, "raw.csv"), `anos ${histFrom} ${histTo} linhas ${objects.length}\n`);
    await writeFile(
      join(DATA_DIR, "recebimentos.json"),
      JSON.stringify({ consolidado: caixaTodos, filial: caixaFilial }, null, 2)
    );
    return {
      rows: objects.length,
      from: histFrom,
      to: histTo,
      matriz: snapshot.caixaOficial?.matriz?.receitaTotal || null,
      filial: caixaFilial ? caixaFilial.receitaTotal : null,
      consolidado: caixaTodos ? caixaTodos.receitaTotal : null,
    };
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && process.argv[1].endsWith("scrape.js")) {
  scrape()
    .then((r) => {
      console.log(JSON.stringify(r));
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
