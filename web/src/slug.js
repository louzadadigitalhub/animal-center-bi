/* Espelho de bot/people.js. O id de cada pessoa e slug(nome) no servidor,
   entao o front consegue montar a URL da foto sem plumbing extra. */

export const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

export const slug = (s) =>
  norm(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/* Copia literal de SYSTEM_NAMES em bot/people.js */
const SYSTEM_NAMES = new Set([
  "animal center",
  "financeiro center",
  "recepcao center",
  "sao cristovao animal center",
  "sao cristovao",
]);

/* Conta de sistema nao e pessoa: nao entra no podio.
   As duas primeiras regras espelham isSystemName() em bot/people.js.
   A terceira e exclusiva do podio: "Recepcao Sao Cristovao" NAO esta em
   SYSTEM_NAMES e empata em 3o na Filial — o telao coroaria um balcao. */
export function isSystemName(nome) {
  const n = norm(nome);
  if (!n || n === "sem nome") return true;
  if (SYSTEM_NAMES.has(n)) return true;
  if (n.endsWith(" center") && n.split(" ").length <= 3) return true;
  if (n.startsWith("recepcao") || n.startsWith("balcao")) return true;
  return false;
}

export const fotoUrl = (id, v) => (v ? `/api/foto/${id}?v=${v}` : null);
