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

export async function scrape({ from = monthStartBR(), to = todayBR() } = {}) {
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
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
    const already = await page.locator("text=Painel de controle").count();
    if (!already) {
      const email = page.locator('input[type="email"], input[placeholder="Email"]').first();
      const pass = page.locator('input[type="password"]').first();
      await email.fill(EMAIL);
      await pass.fill(PASSWORD);
      await page.getByRole("button", { name: /Entrar no SimplesVet/i }).click();
      await page.waitForSelector("text=Painel de controle", { timeout: 45000 });
    }

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
    const snapshot = aggregate(objects);
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(join(DATA_DIR, "vendas.json"), JSON.stringify(objects, null, 0));
    await writeFile(
      join(DATA_DIR, "snapshot.json"),
      JSON.stringify({ ok: true, at: new Date().toISOString(), from, to, rows: objects.length, snapshot }, null, 0)
    );
    await writeFile(join(DATA_DIR, "raw.csv"), text);
    return { rows: objects.length, from, to };
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
