/* Puxa o DRE do proprio SimplesVet (Financeiro > Demonstrativo).

   Antes as linhas de custo da nossa DRE eram zero fixo e apareciam como
   traco. O portal ja tem o demonstrativo montado com o plano de contas
   que a clinica de fato usa — Pessoal, Aluguel, Energia, Publicidade,
   Exames — entao nao ha por que inventar categoria nenhuma: a gente le
   a arvore deles e mostra como esta la.

   Regime de caixa (tipo V), nao competencia: e o mesmo criterio do resto
   do painel, que conta o que entrou. Misturar os dois regimes na mesma
   tela daria numeros que nao conversam. */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { opcoesChrome } from "./chrome.js";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const LOGIN = env.SIMPLES_VET_LOGIN_URL || "https://app.simples.vet/login/login.php";
const DEMO = "https://app.simples.vet/financeiro/demonstrativo/demonstrativo.php";
const ANO = Number(process.argv[2]) || new Date().getFullYear();

/* Mesma regra do scrape.js, inclusive o strip de acento: sem ele
   "Sao Cristovao" nao casa com "Animal Center Sao Cristovao" e as duas
   unidades caem em matriz. */
const DATA_PADRAO = fileURLToPath(new URL("../data/", import.meta.url));

const unitDoNome = (n) => {
  const t = String(n || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /cristovao|filial/.test(t) ? "filial" : "matriz";
};

function moneyBR(s) {
  const t = String(s || "").replace(/[R$\s.]/g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

async function entrar(page, ambId) {
  await page.goto(LOGIN, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"], input[placeholder="Email"]').first().fill(env.SIMPLES_VET_EMAIL);
  await page.locator('input[type="password"]').first().fill(env.SIMPLES_VET_PASSWORD);
  await page.getByRole("button", { name: /Entrar no SimplesVet/i }).click();
  const cartoes = page.locator("#ambientes .celx");
  await page.waitForTimeout(1200);
  const ambientes = await page.evaluate(() =>
    [...document.querySelectorAll("#ambientes .celx")].map((el) => ({
      id: el.getAttribute("data-id") || "",
      nome: (el.querySelector("h4")?.innerText || "").trim(),
    }))
  );
  if (await cartoes.count()) {
    const alvo = ambId ? page.locator(`#ambientes .celx[data-id="${ambId}"]`) : cartoes.first();
    await ((await alvo.count()) ? alvo : cartoes).first().click();
  }
  await page.waitForSelector("text=Painel de controle", { timeout: 45000 });
  return ambientes;
}

async function lerDemonstrativo(page, ano) {
  await page.goto(DEMO, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#p__lan_var_inicio", { timeout: 30000 });
  /* Os filtros sao Select2 sobre jQuery: mudar o .value no DOM nao
     avisa o widget nem preenche o campo _text que vai junto no POST.
     Tem que passar pelo jQuery da propria pagina. */
  await page.evaluate((ano) => {
    const $ = window.jQuery;
    const set = (id, v) => $("#" + id).val(v).trigger("change");
    set("p__tipo", "V"); // regime de caixa, igual ao resto do painel
    set("p__lan_var_inicio", `${ano}/01`);
    set("p__lan_var_termino", `${ano}/12`);
  }, ano);
  await page.locator("#p__btn_filtrar").click();

  /* Espera a tabela realmente virar o ano pedido em vez de dormir um
     tempo fixo — o filtro e AJAX e o tempo varia. */
  await page
    .waitForFunction(
      (ano) => {
        const t = document.querySelectorAll("table")[1];
        if (!t) return false;
        const cab = [...t.querySelectorAll("thead th")].map((x) => x.innerText.trim());
        return cab.filter((c) => c.endsWith("/" + ano)).length >= 12;
      },
      ano,
      { timeout: 40000 }
    )
    .catch(() => console.log("  (aviso: a tabela nao chegou a 12 meses)"));

  return page.evaluate(() => {
    const tabelas = [...document.querySelectorAll("table")];
    if (tabelas.length < 2) return null;
    const [tNome, tVal] = tabelas;
    const meses = [...tVal.querySelectorAll("thead th")].map((t) => t.innerText.trim());
    const trN = [...tNome.querySelectorAll("tbody tr")];
    const trV = [...tVal.querySelectorAll("tbody tr")];
    const linhas = [];
    for (let i = 0; i < trN.length; i++) {
      const td = trN[i].querySelector("td");
      if (!td) continue;
      const indent = Number((td.getAttribute("style") || "").match(/text-indent:\s*(\d+)px/)?.[1] || 0);
      linhas.push({
        nome: td.innerText.replace(/\s+/g, " ").trim(),
        nivel: indent / 15,
        total: td.classList.contains("consolidador"),
        id: td.getAttribute("data-categoria") || "",
        valores: [...(trV[i]?.querySelectorAll("td") || [])].map((x) => x.innerText.trim()),
      });
    }
    return { meses, linhas };
  });
}

/* Exportado para o server chamar dentro do mesmo ciclo do scrape. Rodar
   em paralelo nao daria certo: para ler a filial o coletor faz logout e
   entra no outro ambiente, e isso derrubaria a sessao do scrape no meio
   do caminho. */
export async function collectDre(ano = new Date().getFullYear(), dataDir = DATA_PADRAO) {
  await mkdir(dataDir, { recursive: true });
  const browser = await chromium.launch(opcoesChrome());
  try {
    return await coletar(browser, ano, dataDir);
  } finally {
    /* Sem o finally, um erro no meio deixaria o Chrome vivo no container
       e o proximo ciclo abriria outro por cima. */
    await browser.close().catch(() => {});
  }
}

async function coletar(browser, ano, dataDir) {
  const page = await browser.newPage({ locale: "pt-BR", viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(45000);

  const ambientes = await entrar(page, "");
  console.log("ambientes:", ambientes.map((a) => `${a.nome} (${a.id}) -> ${unitDoNome(a.nome)}`).join(" | "));

  const saida = { at: new Date().toISOString(), ano: ano, regime: "caixa", unidades: {} };

  for (const amb of ambientes.length ? ambientes : [{ id: "", nome: "Animal Center" }]) {
    const unit = unitDoNome(amb.nome);
    if (amb.id && ambientes.length > 1) {
      await page.goto("https://app.simples.vet/login/logout.php", { waitUntil: "domcontentloaded" });
      await entrar(page, amb.id);
    }
    const dados = await lerDemonstrativo(page, ano);
    if (!dados) {
      console.log(unit, "->", amb.nome, "| demonstrativo vazio");
      continue;
    }
    /* meses vem como ["01/2026", ..., "Total"]; o Total nao vira mes. */
    const meses = dados.meses.filter((m) => /^\d{2}\/\d{4}$/.test(m));
    saida.unidades[unit] = {
      ambiente: amb.nome,
      ambienteId: amb.id,
      meses,
      linhas: dados.linhas.map((l) => ({
        nome: l.nome,
        nivel: l.nivel,
        total: l.total,
        id: l.id,
        valores: l.valores.slice(0, meses.length).map(moneyBR),
      })),
    };
    console.log(unit, "->", amb.nome, "|", dados.linhas.length, "linhas |", meses.length, "meses");
  }

  const destino = join(dataDir, "dre.json");
  await writeFile(destino, JSON.stringify(saida, null, 2));
  console.log("gravado em", destino);
  return { ano, unidades: Object.keys(saida.unidades) };
}

/* node collect-dre.js 2026 */
if (import.meta.url === `file://${process.argv[1]}`) {
  await collectDre(Number(process.argv[2]) || new Date().getFullYear());
}
