/* Onde esta o Chrome.

   No container o Playwright nao acha o navegador sozinho: a imagem
   guarda os browsers em /ms-playwright e o pacote procura no cache do
   usuario. Sem passar executablePath, launch() estoura "Executable
   doesn't exist" — e foi exatamente o que aconteceu com a coleta do
   DRE, que subiu sem esta busca e falhou calada no servidor enquanto
   funcionava na minha maquina.

   Morava dentro do scrape.js. Virou modulo proprio para que qualquer
   script que abra navegador use a mesma busca, em vez de cada um
   redescobrir isso do jeito dificil. */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function findChrome() {
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

/* As opcoes que todo launch nosso precisa. --no-sandbox porque o
   container roda como root. */
export function opcoesChrome(extra = {}) {
  const executablePath = findChrome() || undefined;
  return {
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    ...extra,
  };
}

/* Ja esta dentro do SimplesVet?

   Antes a prova era esperar o texto "Painel de controle" ficar visivel.
   O portal passou a ter dois elementos com esse texto, o primeiro
   escondido; o Playwright pega o primeiro e espera ele aparecer ate
   estourar. Em producao isso derrubou 26 de 29 ciclos entre 23 e 24/09
   com o login certo — o log mostrava "navigated to .../principal/
   dashboard.php" logo antes do timeout.

   A URL e a prova que nao depende de layout: depois de escolher o
   ambiente o portal sempre cai em /principal/. */
const PAINEL = /\/principal\//;

export function estaDentro(page) {
  return PAINEL.test(page.url());
}

export async function esperarPainel(page, timeout = 60000) {
  await page.waitForURL(PAINEL, { timeout, waitUntil: "domcontentloaded" });
}

/* O SimplesVet as vezes nao entrega o HTML em 60s (padrao do Playwright).
   Tres tentativas com 2 min cada: a pagina de login e o primeiro passo
   de tudo, e um timeout ali abortava o ciclo inteiro com dado velho. */
export async function gotoResiliente(page, url, tentativas = 3) {
  let ultimo;
  for (let i = 0; i < tentativas; i++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
      return;
    } catch (err) {
      ultimo = err;
      console.warn("goto", url, `tentativa ${i + 1}/${tentativas}`, String(err?.message || err).slice(0, 180));
      await page.waitForTimeout(2000 * (i + 1)).catch(() => {});
    }
  }
  throw ultimo;
}
