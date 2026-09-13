/* Onde ficam as fotos dos colaboradores no SimplesVet?
   Navega so lendo, nao altera nada la. Despeja o achado em /tmp/sv/fotos/.

   Rodar:  cd bot && node discover-fotos.js
*/
import { chromium } from "playwright";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

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

const OUT = "/tmp/sv/fotos";
await mkdir(OUT, { recursive: true });

/* Caminhos plausiveis para o cadastro de usuarios. Nao sei qual e o certo:
   o script tenta todos e reporta quais existem. */
const CANDIDATOS = [
  "/cadastro/usuario/usuario.php",
  "/cadastro/usuarios/usuarios.php",
  "/cadastro/funcionario/funcionario.php",
  "/cadastro/colaborador/colaborador.php",
  "/principal/usuario/usuario.php",
  "/configuracao/usuario/usuario.php",
  "/configuracoes/usuario/usuario.php",
  "/admin/usuario/usuario.php",
  "/login/perfil.php",
  "/principal/perfil/perfil.php",
];

/* Mesmo caminho do scrape.js: o Chrome do sistema. O navegador que o
   playwright baixa nao bate com a versao instalada aqui e o launch trava. */
/* Na VPS o findChrome acha o navegador da imagem do playwright. Fora dela
   nao acha (ele so olha caminhos de container), entao caimos no Chrome
   instalado na maquina. */
const executablePath = findChrome() || undefined;
console.log("chrome:", executablePath || "canal do sistema");
const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : { channel: "chrome" }),
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({ locale: "pt-BR", viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(45000);

console.log("entrando...");
await page.goto(env.SIMPLES_VET_LOGIN_URL || "https://app.simples.vet/login/login.php", { waitUntil: "domcontentloaded" });
await page.locator('input[type="email"], input[placeholder="Email"]').first().fill(env.SIMPLES_VET_EMAIL);
await page.locator('input[type="password"]').first().fill(env.SIMPLES_VET_PASSWORD);
await page.getByRole("button", { name: /Entrar no SimplesVet/i }).click();

/* O SimplesVet mostra a tela "Onde deseja efetuar login" com os ambientes
   antes do painel. Sem clicar num deles, "Painel de controle" nunca aparece
   — era nisso que este script estava esbarrando. O scrape.js ja fazia. */
const cartoes = page.locator("#ambientes .celx");
await page.waitForTimeout(1200);
if (await cartoes.count()) {
  console.log("tela de ambientes:", await cartoes.count(), "opcao(oes) — entrando na primeira");
  await cartoes.first().click();
}
await page.waitForSelector("text=Painel de controle", { timeout: 45000 });
console.log("dentro.\n");

const relatorio = { menu: [], paginas: [], imagensDoTopo: [], menuCompleto: [], imagensDaPagina: [] };

await page.screenshot({ path: `${OUT}/00-painel.png`, fullPage: true });

/* 1. A foto do proprio usuario logado costuma estar no canto superior direito */
relatorio.imagensDoTopo = await page.evaluate(() =>
  [...document.querySelectorAll("header img, .navbar img, li.dropdown.user img, .user img")]
    .map((el) => ({ src: el.src, cls: el.className, alt: el.alt, w: el.naturalWidth, h: el.naturalHeight }))
    .filter((i) => i.src)
);
console.log("IMAGENS NO TOPO:", JSON.stringify(relatorio.imagensDoTopo, null, 2), "\n");

/* 2. Qualquer imagem da pagina cujo endereco cheire a foto de pessoa */
relatorio.imagensDaPagina = await page.evaluate(() =>
  [...document.querySelectorAll("img")]
    .map((el) => ({ src: el.src, cls: el.className, alt: el.alt }))
    .filter((i) => /foto|avatar|usuario|usuário|perfil|profile|user/i.test(i.src + " " + i.cls + " " + i.alt))
);
console.log("IMAGENS COM CARA DE FOTO:", JSON.stringify(relatorio.imagensDaPagina, null, 2), "\n");

/* 3. O menu inteiro. Sem isto eu fico chutando caminho; com ele voce me diz
      exatamente onde fica o cadastro de usuarios deste SimplesVet. */
relatorio.menuCompleto = await page.evaluate(() =>
  [...document.querySelectorAll("a[href]")]
    .map((a) => ({ t: a.innerText.replace(/\s+/g, " ").trim(), href: a.getAttribute("href") }))
    .filter((a) => a.href && !a.href.startsWith("#") && !a.href.startsWith("javascript"))
    .filter((a, i, arr) => arr.findIndex((b) => b.href === a.href) === i)
);
console.log(`MENU COMPLETO (${relatorio.menuCompleto.length} links):`);
for (const l of relatorio.menuCompleto) console.log(`   ${(l.t || "(sem texto)").slice(0, 34).padEnd(36)} ${l.href}`);
console.log("");

/* 4. Links que cheiram a equipe */
relatorio.menu = relatorio.menuCompleto.filter((a) =>
  /usuario|usuário|funcionario|funcionário|colaborador|equipe|perfil|veterinario|veterinário|configura/i.test(a.t + " " + a.href)
);
console.log("LINKS DE EQUIPE:", JSON.stringify(relatorio.menu, null, 2), "\n");

/* 5. Tenta cada caminho candidato e conta as imagens de pessoa */
for (const path of CANDIDATOS) {
  const url = "https://app.simples.vet" + path;
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    const status = res?.status() ?? 0;
    const titulo = await page.title();
    const virouLogin = /login/i.test(page.url());
    if (status >= 400 || virouLogin) {
      console.log(`  ${status || "?"}  ${path}${virouLogin ? "  (jogou pro login)" : ""}`);
      continue;
    }
    const imgs = await page.evaluate(() => {
      const linha = (el) => el.closest("tr, li, .row, .panel, .card, form");
      return [...document.querySelectorAll("img")]
        .map((el) => ({
          src: el.src,
          cls: el.className,
          alt: el.alt,
          w: el.naturalWidth,
          h: el.naturalHeight,
          perto: linha(el)?.innerText.replace(/\s+/g, " ").trim().slice(0, 90) || "",
        }))
        .filter((i) => i.src && !/logo|icone|icon|sprite|\.svg$/i.test(i.src));
    });
    const nome = path.replace(/[^a-z0-9]+/gi, "_");
    await page.screenshot({ path: `${OUT}/${nome}.png`, fullPage: true });
    relatorio.paginas.push({ path, status, titulo, imgs });
    console.log(`  ${status}  ${path}  "${titulo}"  ${imgs.length} imagem(ns)  -> ${OUT}/${nome}.png`);
    if (imgs.length) console.log("       ", JSON.stringify(imgs.slice(0, 4), null, 2).replace(/\n/g, "\n        "));
  } catch (e) {
    console.log(`  ERRO ${path}: ${String(e.message).split("\n")[0]}`);
  }
}

await writeFile(`${OUT}/relatorio.json`, JSON.stringify(relatorio, null, 2));
console.log(`\nrelatorio completo: ${OUT}/relatorio.json`);
console.log(`prints das paginas: ${OUT}/`);
await browser.close();
