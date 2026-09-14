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
