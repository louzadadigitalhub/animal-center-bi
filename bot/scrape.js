import { chromium } from "playwright";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { findChrome, gotoResiliente, estaDentro, escolherAmbiente, esperarAmbientesOuPainel } from "./chrome.js";
import { fileURLToPath } from "node:url";
import { aggregate } from "./aggregate.js";
import {
  anoGuardado,
  baixasPorMesDeBaixa,
  cardConfere,
  filaDeMeses,
  mesesFechadosFaltando,
  periodoBate,
  periodoDoMes,
} from "./receita-mes.js";

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
  await gotoResiliente(page, "https://app.simples.vet/login/logout.php").catch(() => {});
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
  await gotoResiliente(page, LOGIN_URL);
  if (estaDentro(page)) {
    if (!ambId) return;
    await logout(page);
    await gotoResiliente(page, LOGIN_URL);
  }
  await submitLoginForm(page);
  await escolherAmbiente(page, ambId);
}

async function listPerfisLogin(page) {
  await gotoResiliente(page, LOGIN_URL);
  if (estaDentro(page)) {
    await logout(page);
    await gotoResiliente(page, LOGIN_URL);
  }
  await submitLoginForm(page);
  /* Era 15s. Sem a lista, o scrape cai no padrao "so matriz" e a filial
     some da coleta — na VPS de producao 15s nao bastam. */
  await esperarAmbientesOuPainel(page);
  return page.evaluate(() =>
    [...document.querySelectorAll("#ambientes .celx")].map((el) => ({
      id: el.getAttribute("data-id") || "",
      nome: (el.querySelector("h4")?.innerText || "").trim(),
    })).filter((x) => x.id)
  );
}

const FILIAL_USER_ID = process.env.SIMPLES_VET_FILIAL_USER_ID || "306237";

async function scrapeRecebimentos(page, from, to, userId = "") {
  /* Prazos da VPS de producao, onde uma pagina do SimplesVet passa de um
     minuto: com 30s a receita da filial vinha null com a coleta certa. */
  await gotoResiliente(page, "https://app.simples.vet/consulta/recebimento/recebimento.php");
  await page.waitForSelector("#p__vba_dat_baixa_text", { timeout: 120000 });
  /* O filtro é AJAX e a página abre no dia de hoje. Os cards de hoje
     ficam na tela até a resposta chegar, e ler 1,2 s depois do clique
     gravou o dia 06/10 da matriz (R$ 3.239,50) em todos os meses. Guarda
     o card de antes e espera ele mudar e parar de mudar. */
  const lerReceita = () =>
    page
      .evaluate(() => {
        for (const el of document.querySelectorAll(".dashboard-stat")) {
          const desc = el.querySelector(".desc");
          const label = (desc?.getAttribute("data-desc") || desc?.innerText || "").trim();
          if (label === "Receita total") return (el.querySelector(".number")?.innerText || "").trim();
        }
        return null;
      })
      .catch(() => null);
  const esperarCard = async (diferenteDe, prazo) => {
    let visto = await lerReceita();
    let desde = Date.now();
    const fim = Date.now() + prazo;
    while (Date.now() < fim) {
      await page.waitForTimeout(500);
      const agora = await lerReceita();
      if (agora !== visto) {
        visto = agora;
        desde = Date.now();
      } else if (agora && agora !== diferenteDe && Date.now() - desde >= 2000) {
        return agora;
      }
    }
    return null;
  };
  const antes = await esperarCard(undefined, 30000);
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
  /* Sem mudar em 2 min (o mês igual a hoje, no dia 1), segue: quem chama
     confere o card com as baixas antes de gravar. */
  await esperarCard(antes, 120000);
  await page.waitForSelector(".dashboard-stat .number", { timeout: 120000 });

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
      periodText: document.querySelector("#p__vba_dat_baixa_text span")?.innerText || "",
      cards,
      porUsuario: tableByCaption("Usuário que realizou a baixa"),
      porDia: tableByCaption("Data de baixa"),
      porForma: tableByCaption("Formas de recebimento"),
    };
  });

  const n = (s) => moneyBR(s);
  const brutoReceita = extracted.cards["Receita total"];
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
    /* Card ausente não é zero: zero de verdade vem escrito "0,00". */
    receitaTotal: brutoReceita == null || String(brutoReceita).trim() === "" ? null : n(brutoReceita),
    emAberto: n(extracted.cards["Em aberto"]),
    daily,
    porUsuario: extracted.porUsuario,
    porForma: extracted.porForma,
    period: extracted.period,
    periodText: extracted.periodText,
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
    /* Com centavos, para bater com o card "Receita total" de Vendas >
       Recebimentos > Este mes do portal, que e a referencia da clinica. */
    receitaTotalExata: Math.round((caixa.receitaTotal || 0) * 100) / 100,
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

function applyRecebimentos(snapshot, caixa, from, unit, aberto = true) {
  const total = Number(caixa?.receitaTotalExata ?? caixa?.receitaTotal);
  if (!caixa || !Number.isFinite(total)) return snapshot;
  const m = String(from).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return snapshot;
  const month = Number(m[2]) - 1;
  const year = Number(m[3]);
  const pack = caixaPack({ ...caixa, receitaTotal: total });
  const dailyFat = caixa.dailyFat?.length ? caixa.dailyFat : dailyFromCaixa(caixa, year, month);
  const chave = `${year}-${String(month + 1).padStart(2, "0")}`;
  const registro = {
    ...pack,
    from: caixa.from || from,
    to: caixa.to || "",
    chave,
    dailyFat: dailyFat.some((d) => d.fat) ? dailyFat : null,
    url: caixa.url,
    at: caixa.at || agoraBrasiliaIso(),
    period: caixa.period,
  };
  const view = snapshot.views?.[unit]?.[year]?.[month];
  if (view) {
    view.caixa = pack;
    view.fat = pack.receitaTotal;
    view.recebido = pack.receitaTotal;
    if (registro.dailyFat) view.dailyFat = registro.dailyFat;
    if (view.dre) {
      for (const row of view.dre) {
        if (row.linha === "Recebimentos" || row.linha === "Lucro bruto" || row.linha === "Resultado operacional") {
          row.valor = pack.receitaTotal;
          row.conhecido = true;
        }
      }
    }
  }
  snapshot.caixaOficialMeses = snapshot.caixaOficialMeses || {};
  snapshot.caixaOficialMeses[unit] = snapshot.caixaOficialMeses[unit] || {};
  snapshot.caixaOficialMeses[unit][chave] = registro;
  /* O resumo de um mês só (caixaOficial) continua sendo o mês aberto.
     Guardar setembro aqui apagaria outubro, que é o que o painel de
     hoje ainda lê por este caminho. */
  if (aberto) {
    snapshot.caixaOficial = snapshot.caixaOficial || {};
    snapshot.caixaOficial[unit] = registro;
  }
  return snapshot;
}

const ARQ_RECEITAS_MESES = () => join(DATA_DIR, "receitas-meses.json");

async function loadReceitasMeses() {
  try {
    const j = JSON.parse(await readFile(ARQ_RECEITAS_MESES(), "utf8"));
    return j && typeof j === "object" ? j : {};
  } catch {
    return {};
  }
}

async function saveReceitasMeses(guardados) {
  await writeFile(ARQ_RECEITAS_MESES(), JSON.stringify(guardados));
}

function subCaixa(a, b) {
  const keys = ["noDia", "posteriores", "adiantamento", "receitaTotal", "emAberto"];
  const out = {};
  for (const k of keys) out[k] = Math.max(0, Math.round((a?.[k] || 0) - (b?.[k] || 0)));
  return out;
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
  const m = String(row["Data e hora"] || row["Data baixa"] || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? Number(m[3]) : 0;
}

function monthOfRow(row) {
  const m = String(row["Data e hora"] || row["Data baixa"] || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? Number(m[2]) : 0;
}

const HIST_FILE = () => join(DATA_DIR, "historico.json");

async function loadHist() {
  try {
    return JSON.parse(await readFile(HIST_FILE(), "utf8"));
  } catch {
    return {};
  }
}

async function saveHist(hist) {
  await writeFile(HIST_FILE(), JSON.stringify(hist, null, 2));
}

function countYearSede(rows, y, unit) {
  return rows.filter((r) => yearOfRow(r) === y && (r._sede || "matriz") === unit).length;
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
  /* "Export vazio" é o portal dizendo que não houve venda no período;
     qualquer outro erro é falha. */
  let semVenda = 0;
  const pedir = (de, ate, rotulo) =>
    exportVendas(page, de, ate)
      .then((c) => {
        if (!c.length) semVenda++;
        return c;
      })
      .catch((e) => {
        if (/^Export vazio/.test(String(e?.message || e))) semVenda++;
        console.warn(rotulo, y, e.message || e);
        return [];
      });
  const ano = await pedir(f, t, "vendas ano inteiro falhou");
  if (ano.length) return Object.assign(ano, { completo: true });
  const a = await pedir(f, `30/06/${y}`, "vendas H1");
  const b = await pedir(`01/07/${y}`, t, "vendas H2");
  /* Metade vazia pode ser export que falhou: não dá para garantir o ano.
     As três vazias pelo portal, e não por erro, é ano sem venda. */
  return Object.assign([...a, ...b], { completo: a.length > 0 && b.length > 0, vazio: semVenda === 3 });
}

export async function scrape({ from, to } = {}) {
  const pNow = nowBrasilia();
  const histFrom = from || `01/01/${pNow.y - 3}`;
  const histTo = to || monthEndBR();
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
  page.setDefaultTimeout(90000);
  page.setDefaultNavigationTimeout(120000);

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
    const hist = await loadHist();
    const doisPerfis = sedes.some((s) => s.unit === "filial");
    const primeiroAno = {};
    for (const r of objects) {
      const u = r._sede || "matriz";
      const y = yearOfRow(r);
      if (y && !(primeiroAno[u] <= y)) primeiroAno[u] = y;
    }
    for (const sede of sedes) {
      await logout(page);
      await login(page, sede.id);
      for (let y = startY; y <= pNow.y; y++) {
        const key = `${sede.unit}:${y}`;
        const jaTem = countYearSede(objects, y, sede.unit);
        if (y < pNow.y && anoGuardado(hist, key, y, jaTem, primeiroAno[sede.unit])) {
          console.log("historico ja salvo", key, jaTem);
          continue;
        }
        let chunk;
        if (y === pNow.y) {
          /* O mês atual é rebaixado a cada ciclo. Mês do ano que já fechou
             é baixado uma vez, inteiro, depois de fechar — o último ciclo
             do mês nunca pega as horas finais — e fica guardado. Na virada
             é só o mês que acabou; num volume novo, o ano até hoje. */
          const faltando = mesesFechadosFaltando(hist, key, pNow.m);
          const fechados = faltando.map((m) => `${key}-${String(m).padStart(2, "0")}`);
          const anoTodo = faltando.length > 0;
          if (faltando[0] === 1) {
            chunk = await exportVendasYear(page, y, histTo);
            console.log("vendas ano corrente", sede.unit, y, chunk.length, chunk.completo ? "completo" : "parcial");
          } else if (anoTodo) {
            const de = `01/${String(faltando[0]).padStart(2, "0")}/${y}`;
            chunk = await exportVendas(page, de, histTo)
              .then((c) => Object.assign(c, { completo: true }))
              .catch((e) => {
                console.warn("vendas meses fechados", sede.unit, de, e.message || e);
                return [];
              });
            console.log("vendas meses fechados", sede.unit, de, chunk.length);
          } else {
            chunk = await exportVendas(page, monthStartBR(), histTo).catch((e) => {
              console.warn("vendas mes atual", sede.unit, e.message || e);
              return [];
            });
            console.log("vendas mes atual", sede.unit, y, pNow.m, chunk.length);
          }
          if (!chunk.length) continue;
          /* Só troca os meses que vieram: export parcial não apaga o resto. */
          const veio = new Set(chunk.map(monthOfRow));
          objects = objects.filter((r) => {
            if ((r._sede || "matriz") !== sede.unit) return true;
            if (yearOfRow(r) !== y) return true;
            const m = monthOfRow(r);
            return m !== pNow.m && !veio.has(m);
          });
          if (anoTodo && chunk.completo) for (const k of fechados) hist[k] = { at: agoraBrasiliaIso() };
        } else {
          chunk = await exportVendasYear(page, y, histTo);
          console.log("vendas historico", sede.unit, y, chunk.length, chunk.vazio ? "sem venda" : "");
          if (!chunk.length) {
            if (chunk.vazio) hist[key] = { at: agoraBrasiliaIso(), rows: 0 };
            continue;
          }
          objects = objects.filter((r) => !(yearOfRow(r) === y && (r._sede || "matriz") === sede.unit));
          hist[key] = { at: agoraBrasiliaIso(), rows: chunk.length };
        }
        const tagged = doisPerfis ? chunk.map((r) => ({ ...r, _sede: sede.unit })) : chunk;
        objects.push(...tagged);
      }
    }
    await saveHist(hist);
    if (!objects.length) throw new Error("Export nao veio (csv vazio).");
    let snapshot = aggregate(objects);
    const caixaByUnit = {};
    /* Cada mês é uma ida a Vendas › Recebimentos: dia 1 até o último
       dia, filtrar, ler o card Receita total. O mês aberto é relido
       sempre. Mês fechado, lido depois que ele acabou, fica guardado. */
    const guardados = await loadReceitasMeses();
    /* Leitura gravada que não confere com as baixas daquele mês sai da
       gaveta e volta para a fila — as de 06/10 que pegaram o dia de hoje. */
    const baixasMes = baixasPorMesDeBaixa(objects);
    for (const [u, meses] of Object.entries(guardados)) {
      for (const [k, v] of Object.entries(meses || {})) {
        const card = v?.receitaTotalExata ?? v?.receitaTotal;
        if (cardConfere(card, baixasMes[u]?.[k])) continue;
        console.warn("recebimentos descartado", u, k, card, Math.round(baixasMes[u]?.[k] || 0));
        delete meses[k];
      }
    }
    snapshot.caixaOficialMeses = guardados;
    const mesAberto = periodoDoMes(pNow.y, pNow.m - 1);
    /* Até 8 por unidade: o mês que está correndo e os fechados que ainda
       não têm card lido depois de fechar. Mais do que isso estoura o
       limite de 60 min do ciclo antes de gravar o painel. O que faltou
       entra no seguinte; com tudo lido, o ciclo lê só o mês atual. */
    const limiteMeses = Number(process.env.RECEITA_MESES_POR_CICLO || 8);
    await mkdir(DATA_DIR, { recursive: true });
    for (const sede of sedes) {
      const fila = filaDeMeses(pNow, {
        anoInicio: startY,
        /* São Cristóvão abriu em mar/2025. Mês sem card esperava 4 min até
           desistir, e voltava para a fila em todo ciclo. */
        desde: Object.keys(baixasMes[sede.unit] || {}).sort()[0] || "",
        jaLidos: guardados[sede.unit] || {},
        limite: limiteMeses,
      });
      console.log("recebimentos fila", sede.unit, fila.map((m) => m.chave).join(","));
      try {
        await logout(page);
        await login(page, sede.id);
      } catch (err) {
        console.warn("recebimentos login", sede.unit, err?.message || err);
        continue;
      }
      for (const mes of fila) {
        try {
          const cx = await scrapeRecebimentos(page, mes.from, mes.to, "");
          const periodoLido = cx.period || cx.periodText;
          if (!periodoBate(periodoLido, mes.from, mes.to)) {
            console.warn("recebimentos periodo nao aplicou", sede.unit, mes.chave, periodoLido);
            continue;
          }
          if (!Number.isFinite(Number(cx.receitaTotal))) {
            console.warn("recebimentos sem card", sede.unit, mes.chave);
            continue;
          }
          if (!cardConfere(cx.receitaTotal, baixasMes[sede.unit]?.[mes.chave])) {
            console.warn(
              "recebimentos nao confere com as baixas",
              sede.unit,
              mes.chave,
              cx.receitaTotal,
              Math.round(baixasMes[sede.unit]?.[mes.chave] || 0)
            );
            continue;
          }
          const lido = { ...cx, from: mes.from, to: mes.to, chave: mes.chave, at: agoraBrasiliaIso() };
          guardados[sede.unit] = guardados[sede.unit] || {};
          guardados[sede.unit][mes.chave] = lido;
          snapshot = applyRecebimentos(snapshot, lido, mes.from, sede.unit, mes.aberto);
          if (mes.aberto) caixaByUnit[sede.unit] = lido;
          await saveReceitasMeses(guardados);
          console.log("recebimentos", sede.unit, mes.chave, cx.receitaTotal);
        } catch (err) {
          console.warn("recebimentos", sede.unit, mes.chave, err?.message || err);
        }
      }
    }
    for (const unit of ["matriz", "filial"]) {
      if (caixaByUnit[unit] || !guardados[unit]?.[mesAberto.chave]) continue;
      caixaByUnit[unit] = guardados[unit][mesAberto.chave];
      snapshot = applyRecebimentos(snapshot, caixaByUnit[unit], mesAberto.from, unit, true);
    }
    const caixaTodos = caixaByUnit.matriz && caixaByUnit.filial
      ? {
          ...caixaByUnit.matriz,
          noDia: (caixaByUnit.matriz.noDia || 0) + (caixaByUnit.filial.noDia || 0),
          posteriores: (caixaByUnit.matriz.posteriores || 0) + (caixaByUnit.filial.posteriores || 0),
          adiantamento: (caixaByUnit.matriz.adiantamento || 0) + (caixaByUnit.filial.adiantamento || 0),
          receitaTotal:
            Number(caixaByUnit.matriz.receitaTotalExata ?? caixaByUnit.matriz.receitaTotal ?? 0) +
            Number(caixaByUnit.filial.receitaTotalExata ?? caixaByUnit.filial.receitaTotal ?? 0),
          emAberto: (caixaByUnit.matriz.emAberto || 0) + (caixaByUnit.filial.emAberto || 0),
        }
      : caixaByUnit.matriz || caixaByUnit.filial || null;
    if (caixaTodos) snapshot = applyRecebimentos(snapshot, caixaTodos, mesAberto.from, "consolidado");
    if (caixaByUnit.matriz && !caixaByUnit.filial) {
      snapshot = applyRecebimentos(snapshot, caixaByUnit.matriz, mesAberto.from, "matriz");
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
    /* Cabeca e caixa calculados uma vez: o snapshot e o resumo dele
       precisam do mesmo "at". */
    const cabeca = { ok: true, at: agoraBrasiliaIso(), from: histFrom, to: histTo, rows: objects.length };
    const caixaResumo = {
      consolidado: caixaTodos ? caixaPack(caixaTodos) : null,
      filial: caixaFilial ? caixaPack(caixaFilial) : null,
      matriz: snapshot.caixaOficial?.matriz || null,
    };
    await writeFile(join(DATA_DIR, "snapshot.json"), JSON.stringify({ ...cabeca, snapshot, caixa: caixaResumo }, null, 0));
    /* Resumo pequeno do snapshot, para o painel. A thread de consultas so
       precisa destes campos; o snapshot inteiro carrega as visoes de todos
       os meses com a lista de clientes de cada um, e fazer o parse dele na
       VPS de producao passou de 5 minutos em 25/09. Grava depois do
       snapshot, com o mesmo "at": quem le confere os dois. */
    await writeFile(
      join(DATA_DIR, "snapshot-meta.json"),
      JSON.stringify({
        ...cabeca,
        caixa: caixaResumo,
        snapshot: {
          headers: snapshot.headers,
          years: snapshot.years,
          clientesStatus: snapshot.clientesStatus,
          caixaOficial: snapshot.caixaOficial,
          caixaOficialMeses: snapshot.caixaOficialMeses,
        },
      })
    );
    await writeFile(join(DATA_DIR, "raw.csv"), `anos ${histFrom} ${histTo} linhas ${objects.length}\n`);
    await writeFile(
      join(DATA_DIR, "recebimentos.json"),
      JSON.stringify(
        {
          consolidado: caixaTodos,
          filial: caixaFilial,
          meses: Object.fromEntries(
            ["matriz", "filial"].map((u) => [
              u,
              Object.fromEntries(
                Object.entries(guardados[u] || {}).map(([k, v]) => [k, v.receitaTotalExata ?? v.receitaTotal])
              ),
            ])
          ),
        },
        null,
        2
      )
    );
    const anos = [...new Set(objects.map((r) => yearOfRow(r)).filter(Boolean))].sort();
    const temVendaFilial = objects.some((r) => r._sede === "filial");
    const temCaixaFilial = Boolean(caixaByUnit.filial && caixaByUnit.filial.receitaTotal > 0);
    const espelho = {
      at: agoraBrasiliaIso(),
      rows: objects.length,
      perfis: sedes.map((s) => s.unit + ":" + s.nome),
      anos,
      historico: hist,
      /* Venda da filial ja prova que o perfil 2 entrou. Exigir so o
         cartao de recebimento fazia o aviso ficar falso com a Filial
         cheia de venda e o cartao falhando um ciclo. */
      filialOk: temVendaFilial || temCaixaFilial || sedes.some((s) => s.unit === "filial"),
      receitasMeses: {
        matriz: Object.keys(guardados.matriz || {}).sort(),
        filial: Object.keys(guardados.filial || {}).sort(),
      },
    };
    await writeFile(join(DATA_DIR, "espelho.json"), JSON.stringify(espelho, null, 2));
    return {
      at: espelho.at,
      rows: objects.length,
      from: histFrom,
      to: histTo,
      matriz: snapshot.caixaOficial?.matriz?.receitaTotal || null,
      filial: caixaFilial ? caixaFilial.receitaTotal : null,
      consolidado: caixaTodos ? caixaTodos.receitaTotal : null,
      anos,
      filialOk: espelho.filialOk,
      receitasMeses: espelho.receitasMeses,
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
