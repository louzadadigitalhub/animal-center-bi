/* Quem ve o que.

   O Supabase responde "quem e voce". Quem responde "o que voce pode ver" e
   este arquivo, guardado no volume da VPS. Separar os dois evita uma consulta
   ao Supabase por requisicao e mantem o painel de pe se ele cair.

   A regra vale no SERVIDOR, nao na tela. Esconder a aba no menu nao esconde
   o dado: sem este filtro, quem tivesse so "Vendas" ainda receberia os 221
   telefones de tutor no mesmo /api/snapshot. */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, "..", "data");
const ARQ = join(DATA_DIR, "perfis.json");

export const PAGINAS = [
  { id: "vendas", nome: "Vendas" },
  { id: "ritmo", nome: "Ritmo do dia" },
  { id: "equipe", nome: "Equipe" },
  { id: "clientes", nome: "Clientes", sensivel: true },
  { id: "recorrencia", nome: "Recorrencia", sensivel: true },
  { id: "vacinas", nome: "Vacinas" },
  { id: "pesquisa", nome: "Pesquisa" },
  { id: "dre", nome: "DRE", sensivel: true },
  { id: "tv", nome: "Ranking" },
];

export const IDS = PAGINAS.map((p) => p.id);

/* Campos do snapshot que cada aba precisa. O que nao estiver aqui nao sai
   do servidor para quem nao tem a aba. */
const CAMPOS = {
  vendas: ["fat", "fatVenda", "qtd", "caixa", "grupos", "dailyFat", "monthlyFat", "monthlyQtd", "monthlyPorAno", "monthlyFatPrev", "compareYears", "eletivas", "metaEletivas", "eletivasPct", "ticketCliente", "ticketVenda", "receitaFonte"],
  ritmo: ["hourly", "consultas", "emergencia", "internacao", "plantao", "examesQtd", "atendimentos", "vacinasAplicadas", "diaLabel", "fat", "caixa", "grupos"],
  equipe: ["equipe"],
  clientes: ["clientes", "mapPoints", "racas", "especies", "genero", "origem", "novos"],
  recorrencia: ["recorrentes", "novos", "monthlyQtd", "monthlyFat", "hourly"],
  vacinas: ["vacinas", "vacinasTop", "vacinasTipo", "vacinasAplicadas", "vsPrev"],
  pesquisa: ["nps"],
  dre: ["dre", "dreReal", "fat", "fatVenda", "caixa", "receitaFonte"],
  tv: ["equipe"],
};

/* Sempre presentes: sao o cabecalho da tela, nao dado de negocio. */
const BASE = ["id", "nome", "casa", "diaLabel", "dias", "rotulosSerie", "intervalo", "filtroGrupo", "vsPrev"];

export function filtrarView(view, paginas) {
  if (!view) return view;
  if (paginas === "todas") return view;
  const permitidos = new Set(BASE);
  for (const p of paginas) for (const c of CAMPOS[p] || []) permitidos.add(c);
  const out = {};
  for (const k of Object.keys(view)) if (permitidos.has(k)) out[k] = view[k];
  return out;
}

/* Ranking do corredor: telao publico, sem login. So o que o podio desenha —
   nome, faturamento e quantidade. Nenhum dado de tutor passa por aqui. */
export function viewPublicaRanking(view) {
  if (!view) return null;
  return {
    casa: view.casa,
    diaLabel: view.diaLabel,
    equipe: (view.equipe || []).map((p) => ({
      nome: p.nome,
      fat: p.fat,
      vendas: p.vendas,
      casa: p.casa,
    })),
  };
}

async function ler() {
  try {
    const d = JSON.parse(await readFile(ARQ, "utf8"));
    return { admins: d.admins || [], perfis: d.perfis || {} };
  } catch {
    return { admins: [], perfis: {} };
  }
}

async function gravar(doc) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(ARQ, JSON.stringify(doc, null, 2), { mode: 0o600 });
}

const norm = (email) => String(email || "").trim().toLowerCase();

/* O primeiro e-mail que entrar vira admin. Sem isso ninguem conseguiria dar
   acesso a ninguem: o painel nasceria trancado para todo mundo, inclusive
   para quem o criou. */
export async function perfilDe(email) {
  const e = norm(email);
  if (!e) return null;
  const doc = await ler();
  if (!doc.admins.length) {
    doc.admins = [e];
    doc.perfis[e] = { paginas: "todas", criadoEm: new Date().toISOString(), primeiro: true };
    await gravar(doc);
    return { email: e, admin: true, paginas: "todas" };
  }
  const admin = doc.admins.includes(e);
  if (admin) return { email: e, admin: true, paginas: "todas" };
  const p = doc.perfis[e];
  if (!p) return { email: e, admin: false, paginas: [] };
  return { email: e, admin: false, paginas: p.paginas === "todas" ? "todas" : p.paginas || [] };
}

export async function listarPerfis() {
  const doc = await ler();
  return Object.entries(doc.perfis).map(([email, p]) => ({
    email,
    admin: doc.admins.includes(email),
    paginas: p.paginas === "todas" ? "todas" : p.paginas || [],
    criadoEm: p.criadoEm || null,
  }));
}

export async function salvarPerfil(email, paginas) {
  const e = norm(email);
  if (!e) return { ok: false, error: "email invalido" };
  const doc = await ler();
  if (doc.admins.includes(e)) return { ok: false, error: "a conta admin ve tudo" };
  const lista = paginas === "todas" ? "todas" : (Array.isArray(paginas) ? paginas : []).filter((p) => IDS.includes(p));
  doc.perfis[e] = { ...(doc.perfis[e] || {}), paginas: lista, criadoEm: doc.perfis[e]?.criadoEm || new Date().toISOString() };
  await gravar(doc);
  return { ok: true };
}

export async function removerPerfil(email) {
  const e = norm(email);
  const doc = await ler();
  if (doc.admins.includes(e)) return { ok: false, error: "nao da para remover a conta admin" };
  delete doc.perfis[e];
  await gravar(doc);
  return { ok: true };
}
