import { chromium } from "playwright";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { aggregate } from "./aggregate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, "..", "data");

const EMAIL = process.env.SIMPLES_VET_EMAIL;
const PASSWORD = process.env.SIMPLES_VET_PASSWORD;
const LOGIN_URL = process.env.SIMPLES_VET_LOGIN_URL || "https://app.simples.vet/login/login.php";

function todayBR() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
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
  await page.locator("#p__ven_dat_data_text").click({ force: true });
  await page.waitForTimeout(300);
  const esteMes = page.locator(".daterangepicker .ranges li", { hasText: /^Este mês$/ });
  if (from.startsWith("01/09/") || from.startsWith("01/" + String(new Date().getMonth() + 1).padStart(2, "0") + "/")) {
    if (await esteMes.count()) {
      await esteMes.first().click();
      await page.waitForTimeout(400);
      return;
    }
  }
  await page.evaluate(
    ({ from, to }) => {
      const hidden = document.getElementById("p__ven_dat_data");
      const span = document.querySelector("#p__ven_dat_data_text span");
      if (hidden) hidden.value = `${from}-${to}`;
      if (span) span.textContent = `${from} até ${to}`;
      const apply = document.querySelector(".daterangepicker .btn-success, .daterangepicker button.applyBtn, .daterangepicker [type=submit]");
      apply?.click();
    },
    { from, to }
  );
  await page.waitForTimeout(400);
}

function monthStartBR() {
  const d = new Date();
  return `01/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function monthEndBR() {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return `${String(last).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function moneyBR(s) {
  const t = String(s || "").replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

async function login(page) {
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
  const already = await page.locator("text=Painel de controle").count();
  if (already) return;
  await page.locator('input[type="email"], input[placeholder="Email"]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.getByRole("button", { name: /Entrar no SimplesVet/i }).click();
  await page.waitForSelector("text=Painel de controle", { timeout: 45000 });
}

async function scrapeRecebimentos(page, from, to) {
  const urls = [
    "https://app.simples.vet/principal/financeiro/recebimento.php",
    "https://app.simples.vet/principal/recebimento/recebimento.php",
    "https://app.simples.vet/principal/venda/recebimento.php",
    "https://app.simples.vet/principal/relatorio/recebimento.php",
    "https://app.simples.vet/principal/caixa/recebimento.php",
  ];
  let found = false;
  const menu = page.getByRole("link", { name: /Recebimento/i }).first();
  if (await menu.count()) {
    await menu.click();
    await page.waitForTimeout(1200);
    found = /Receita total|Lista de Recebimentos|Baixas no dia/i.test(await page.locator("body").innerText());
  }
  for (const u of urls) {
    if (found) break;
    const res = await page.goto(u, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => null);
    if (!res) continue;
    await page.waitForTimeout(800);
    const body = await page.locator("body").innerText();
    if (/Receita total|Lista de Recebimentos|Baixas no dia/i.test(body)) {
      found = true;
      break;
    }
  }
  if (!found) {
    console.warn("tela de recebimentos nao encontrada");
    return null;
  }

  await page.evaluate(
    ({ from, to }) => {
      const hidden =
        document.getElementById("p__ven_dat_data") ||
        document.querySelector("input[name*='data']") ||
        document.querySelector("#p__dat_data");
      const span = document.querySelector("#p__ven_dat_data_text span, .daterange span");
      if (hidden) hidden.value = `${from}-${to}`;
      if (span) span.textContent = `${from} até ${to}`;
    },
    { from, to }
  );
  const filtrar = page.locator("#p__btn_filtrar, button:has-text('Filtrar'), input[value='Filtrar']").first();
  if (await filtrar.count()) {
    await filtrar.click();
    await page.waitForTimeout(2000);
  }

  const cards = await page.evaluate(() => {
    const txt = document.body.innerText.replace(/\s+/g, " ");
    const grab = (label) => {
      const re = new RegExp("([\\$R]?\\s*[\\d\\.\\,]{3,})\\s*" + label, "i");
      const m = txt.match(re);
      return m ? m[1] : "";
    };
    return {
      noDia: grab("Baixas no dia"),
      posteriores: grab("Baixas posteriores"),
      adiantamento: grab("Adiantamento"),
      receitaTotal: grab("Receita total"),
      emAberto: grab("Em aberto"),
      raw: txt.slice(0, 1500),
    };
  });

  const lista = page.getByText(/Lista de Recebimentos/i).first();
  if (await lista.count()) {
    await lista.click();
    await page.waitForTimeout(1500);
  }

  let daily = [];
  const tableDaily = await page.evaluate(() => {
    const out = [];
    const rows = [...document.querySelectorAll("table tr")];
    for (const tr of rows) {
      const cells = [...tr.querySelectorAll("td, th")].map((c) => c.innerText.trim());
      const date = cells.find((c) => /\d{2}\/\d{2}\/\d{4}/.test(c));
      const money = [...cells].reverse().find((c) => /[\d\.]+,\d{2}/.test(c));
      if (date && money) out.push({ date, money });
    }
    return out;
  });
  daily = tableDaily;

  const toN = (s) => {
    const t = String(s || "").replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
    const n = Number(t);
    return Number.isFinite(n) ? n : 0;
  };

  return {
    noDia: toN(cards.noDia),
    posteriores: toN(cards.posteriores),
    adiantamento: toN(cards.adiantamento),
    receitaTotal: toN(cards.receitaTotal),
    emAberto: toN(cards.emAberto),
    daily,
    url: page.url(),
    raw: cards.raw,
  };
}

function applyRecebimentos(snapshot, caixa, from) {
  if (!caixa || !caixa.receitaTotal) return snapshot;
  const m = String(from).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return snapshot;
  const month = Number(m[2]) - 1;
  const year = Number(m[3]);
  const dailyFat = [];
  if (caixa.daily?.length) {
    const byDay = {};
    for (const row of caixa.daily) {
      const dm = String(row.date).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (!dm) continue;
      const d = Number(dm[1]);
      const val = Number(String(row.money).replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", "."));
      if (Number.isFinite(val)) byDay[d] = (byDay[d] || 0) + val;
    }
    const daysIn = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysIn; d++) dailyFat.push({ d, fat: Math.round(byDay[d] || 0) });
  }
  const pack = {
    noDia: Math.round(caixa.noDia),
    posteriores: Math.round(caixa.posteriores),
    adiantamento: Math.round(caixa.adiantamento),
    receitaTotal: Math.round(caixa.receitaTotal),
    emAberto: Math.round(caixa.emAberto),
  };
  const view = snapshot.views?.matriz?.[year]?.[month];
  if (view) {
    view.caixa = pack;
    view.fat = pack.receitaTotal;
    view.recebido = pack.receitaTotal;
    if (dailyFat.length) view.dailyFat = dailyFat;
  }
  snapshot.caixaOficial = { ...pack, url: caixa.url, at: new Date().toISOString() };
  return snapshot;
}

export async function scrape({ from = monthStartBR(), to = monthEndBR() } = {}) {
  if (!EMAIL || !PASSWORD) throw new Error("SIMPLES_VET_EMAIL/PASSWORD ausentes");

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    acceptDownloads: true,
    locale: "pt-BR",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  try {
    await login(page);

    await page.goto("https://app.simples.vet/principal/venda/venda.php", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForSelector("#filter", { timeout: 30000 });
    await setDateRange(page, from, to);
    await page.locator("#p__btn_filtrar").click();
    await page.waitForTimeout(2500);

    await page.locator("#p__btn_relatorio").click({ force: true });
    await page.waitForTimeout(400);
    const popupPromise = page.waitForEvent("popup", { timeout: 25000 }).catch(() => null);
    const downloadPromise = page.waitForEvent("download", { timeout: 25000 }).catch(() => null);
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

    if (!text) {
      const html = await page.content();
      throw new Error("Export nao veio (csv vazio). html=" + html.length);
    }

    const objects = rowsToObjects(parseCsv(text));
    let snapshot = aggregate(objects);
    let caixa = null;
    try {
      caixa = await scrapeRecebimentos(page, from, to);
      snapshot = applyRecebimentos(snapshot, caixa, from);
    } catch (err) {
      console.warn("recebimentos falhou", err);
    }
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(join(DATA_DIR, "vendas.json"), JSON.stringify(objects, null, 0));
    await writeFile(
      join(DATA_DIR, "snapshot.json"),
      JSON.stringify({ ok: true, at: new Date().toISOString(), from, to, rows: objects.length, snapshot, caixa }, null, 0)
    );
    await writeFile(join(DATA_DIR, "raw.csv"), text);
    if (caixa) await writeFile(join(DATA_DIR, "recebimentos.json"), JSON.stringify(caixa, null, 2));
    return { rows: objects.length, from, to, caixa: caixa ? caixa.receitaTotal : null };
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
