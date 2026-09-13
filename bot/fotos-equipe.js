/* Busca a foto da equipe no SimplesVet e guarda no volume da VPS.

   Onde elas estao: pagina /v3/ambiente/usuarios, com a imagem hospedada num
   bucket publico do proprio SimplesVet (simplesvet-public/usuario/thumb50/).
   Quem nao tem foto aparece como unknown.jpg ou como iniciais.

   Roda uma vez por dia, nao a cada raspagem de 2 minutos: foto muda pouco e
   bater de hora em hora no sistema deles seria carga a toa.

   Uso:  node fotos-equipe.js
*/
import { chromium } from "playwright";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { casarNome } from "./casar-nomes.js";
import { savePhoto, slug, vendasParseadas } from "./people.js";

const env = (() => {
  const p = new URL("../.env", import.meta.url);
  if (!existsSync(p)) return process.env;
  const lido = Object.fromEntries(
    readFileSync(p, "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
  );
  return { ...lido, ...process.env };
})();

function findChrome() {
  const roots = [process.env.PLAYWRIGHT_CHROMIUM_PATH, process.env.PLAYWRIGHT_BROWSERS_PATH,
    "/ms-playwright", "/root/.cache/ms-playwright", "/home/pwuser/.cache/ms-playwright"].filter(Boolean);
  const nomes = ["headless_shell", "chrome", "chromium"];
  const walk = (dir, d = 0) => {
    if (!dir || !existsSync(dir) || d > 5) return null;
    try {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const f = join(dir, e.name);
        if (e.isFile() && nomes.includes(e.name)) return f;
        if (e.isDirectory()) { const hit = walk(f, d + 1); if (hit) return hit; }
      }
    } catch { return null; }
    return null;
  };
  for (const r of roots) { const hit = walk(r); if (hit) return hit; }
  return null;
}

export async function buscarFotos() {
  if (!env.SIMPLES_VET_EMAIL || !env.SIMPLES_VET_PASSWORD) {
    return { ok: false, error: "faltam SIMPLES_VET_EMAIL/PASSWORD" };
  }
  const executablePath = findChrome() || undefined;
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : { channel: "chrome" }),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ locale: "pt-BR", viewport: { width: 1500, height: 1200 } });
  page.setDefaultTimeout(60000);
  try {
    await page.goto("https://app.simples.vet/login/logout.php", { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.goto(env.SIMPLES_VET_LOGIN_URL || "https://app.simples.vet/login/login.php", { waitUntil: "domcontentloaded" });
    if (!(await page.locator("text=Painel de controle").count())) {
      await page.locator('input[type="email"], input[placeholder="Email"]').first().fill(env.SIMPLES_VET_EMAIL);
      await page.locator('input[type="password"]').first().fill(env.SIMPLES_VET_PASSWORD);
      await page.getByRole("button", { name: /Entrar no SimplesVet/i }).click();
      /* Tela "Onde deseja efetuar login": sem escolher um ambiente o painel
         nunca carrega. */
      const amb = page.locator("#ambientes .celx");
      await page.waitForTimeout(1500);
      if (await amb.count()) await amb.first().click();
      await page.waitForSelector("text=Painel de controle", { timeout: 60000 });
    }

    await page.goto("https://app.simples.vet/v3/ambiente/usuarios", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    /* A lista so pinta a imagem da linha que entra na tela */
    for (let i = 0; i < 16; i += 1) {
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(600);
    }
    await page.waitForTimeout(2000);

    /* Pega a linha inteira: o nome fica numa celula irma da imagem, nao num
       ancestral direto — subir pelo DOM a partir da imagem so achava parte. */
    const doCadastro = await page.evaluate(() => {
      const linhas = [...document.querySelectorAll("tr, [role='row'], li, div")]
        .filter((l) => l.querySelector("img") && (l.innerText || "").trim().length > 3);
      const out = [];
      for (const l of linhas) {
        const img = l.querySelector("img");
        if (!img || !/simplesvet-public[/]usuario/.test(img.src)) continue;
        if (/unknown/.test(img.src)) continue;
        const texto = (l.innerText || "").replace(/\s+/g, " ").trim();
        const nome = texto.split(/\s{2,}|·|[|]/)[0].trim().slice(0, 60);
        if (nome.length > 2) out.push({ nome, foto: img.src });
      }
      const vistos = new Set();
      return out.filter((x) => !vistos.has(x.foto) && vistos.add(x.foto));
    });

    const vendas = await vendasParseadas();
    const pessoas = [...new Set(vendas.map((r) => r.user).filter(Boolean))];
    const resultado = { encontradas: doCadastro.length, salvas: 0, semPar: [], falhas: [] };

    for (const pessoa of pessoas) {
      const par = casarNome(pessoa, doCadastro);
      if (!par) { resultado.semPar.push(pessoa); continue; }
      try {
        const r = await fetch(par.foto);
        if (!r.ok) throw new Error(`http ${r.status}`);
        const buf = Buffer.from(await r.arrayBuffer());
        /* savePhoto confere o tipo pelos bytes, nao pela extensao nem pelo
           header — importa mais aqui, porque o byte vem de terceiro. */
        const s = await savePhoto(slug(pessoa), buf);
        if (s.ok) resultado.salvas += 1;
        else resultado.falhas.push(`${pessoa}: ${s.error}`);
      } catch (e) {
        resultado.falhas.push(`${pessoa}: ${e.message}`);
      }
    }
    return { ok: true, ...resultado };
  } finally {
    await browser.close().catch(() => {});
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await buscarFotos();
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}
