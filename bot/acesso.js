/* Quem ve o que.

   O Supabase responde "quem e voce". Quem responde "o que voce pode ver" e
   este arquivo, guardado no volume da VPS. Separar os dois evita uma consulta
   ao Supabase por requisicao e mantem o painel de pe se ele cair.

   A regra vale no SERVIDOR, nao na tela. Esconder a aba no menu nao esconde
   o dado: sem este filtro, quem tivesse so "Vendas" ainda receberia os 221
   telefones de tutor no mesmo /api/snapshot. */

import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
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
  { id: "dashboard", nome: "Dashboard", sensivel: true },
  { id: "comparativo", nome: "Comparativo" },
  { id: "veterinarios", nome: "Veterinários", sensivel: true },
  { id: "contas", nome: "Contas a pagar", sensivel: true },
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
  /* A aba Contas a pagar lê /api/contas, não o snapshot. */
  contas: [],
  /* A aba Dashboard lê /api/dashboard. */
  dashboard: [],
  /* Comparativo e Veterinários leem /api/analise e /api/veterinarios. */
  comparativo: [],
  veterinarios: [],
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

/* Faturamento por pessoa so para quem entrou e tem uma aba que ja recebe
   "equipe" no snapshot (Equipe ou Ranking). */
export function veValoresDoRanking(perfil) {
  if (!perfil) return false;
  if (perfil.paginas === "todas") return true;
  return Array.isArray(perfil.paginas) && perfil.paginas.some((p) => (CAMPOS[p] || []).includes("equipe"));
}

/* Ranking do corredor: telao publico, sem login. TV publica nao mostra
   dinheiro (decisao de 20/10/2026): sem login sai so nome, unidade e
   quantidade de vendas, na ordem do ranking. O faturamento de cada um so
   vai para a diretoria logada (veValoresDoRanking). Nenhum dado de tutor
   passa por aqui. */
export function viewPublicaRanking(view, perfil = null) {
  if (!view) return null;
  const comValores = veValoresDoRanking(perfil);
  return {
    casa: view.casa,
    diaLabel: view.diaLabel,
    equipe: (view.equipe || []).map((p) => ({
      nome: p.nome,
      vendas: p.vendas,
      casa: p.casa,
      ...(comValores ? { fat: p.fat } : {}),
    })),
  };
}

/* Arquivo que nao existe e painel novo, sem ninguem. Qualquer outro erro
   (JSON quebrado, formato estranho, disco, permissao) devolve null: quem
   chama nega o acesso e nao grava por cima. Antes o erro virava "sem
   admins", e o proximo login virava admin com todas as abas. O log nao
   repete o conteudo do arquivo (tem e-mails). */
async function ler() {
  let txt;
  try {
    txt = await readFile(ARQ, "utf8");
  } catch (err) {
    if (err?.code === "ENOENT") return { admins: [], perfis: {} };
    console.error("perfis.json ilegivel, acesso negado:", err?.code || "erro de leitura");
    return null;
  }
  try {
    const d = JSON.parse(txt);
    const adminsOk = d && typeof d === "object" && (d.admins === undefined || Array.isArray(d.admins));
    const perfisOk = d && (d.perfis === undefined || (d.perfis && typeof d.perfis === "object" && !Array.isArray(d.perfis)));
    if (!adminsOk || !perfisOk) throw new Error("formato");
    return { admins: d.admins || [], perfis: d.perfis || {} };
  } catch {
    console.error("perfis.json corrompido, acesso negado");
    return null;
  }
}

/* Grava ao lado e troca pelo rename, que e atomico no mesmo disco: queda
   no meio da gravacao nao deixa perfis.json pela metade. */
async function gravar(doc) {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${ARQ}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(tmp, JSON.stringify(doc, null, 2), { mode: 0o600 });
    await rename(tmp, ARQ);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => {});
    throw err;
  }
}

const norm = (email) => String(email || "").trim().toLowerCase();
const ILEGIVEL = { ok: false, error: "perfis.json ilegivel no servidor: nada foi gravado" };

/* A primeira admin vem so de ADMIN_EMAIL, no ambiente do servidor. Antes o
   primeiro e-mail que entrasse virava admin: com cadastro aberto no
   Supabase, ou com o perfis.json ilegivel, podia ser qualquer um. Sem
   ADMIN_EMAIL o painel novo fica sem admin ate alguem definir a variavel. */
export async function perfilDe(email) {
  const e = norm(email);
  if (!e) return null;
  const doc = await ler();
  if (!doc) return null;
  if (!doc.admins.length) {
    const primeira = norm(process.env.ADMIN_EMAIL);
    if (!primeira) {
      console.warn("perfis.json sem admin e ADMIN_EMAIL vazio: ninguem vira admin");
    } else if (e === primeira) {
      doc.admins = [e];
      doc.perfis[e] = { paginas: "todas", criadoEm: new Date().toISOString(), primeiro: true };
      await gravar(doc);
      return { email: e, admin: true, paginas: "todas" };
    }
  }
  const p = doc.perfis[e];
  const senhaProvisoria = Boolean(p?.senhaProvisoria);
  if (doc.admins.includes(e)) return { email: e, admin: true, paginas: "todas", senhaProvisoria };
  if (!p) return { email: e, admin: false, paginas: [], senhaProvisoria };
  return { email: e, admin: false, paginas: p.paginas === "todas" ? "todas" : p.paginas || [], senhaProvisoria };
}

export async function listarPerfis() {
  const doc = await ler();
  if (!doc) return [];
  return Object.entries(doc.perfis).map(([email, p]) => ({
    email,
    admin: doc.admins.includes(email),
    paginas: p.paginas === "todas" ? "todas" : p.paginas || [],
    criadoEm: p.criadoEm || null,
    senhaProvisoria: Boolean(p.senhaProvisoria),
  }));
}

export async function salvarPerfil(email, paginas) {
  const e = norm(email);
  if (!e) return { ok: false, error: "email invalido" };
  const doc = await ler();
  if (!doc) return ILEGIVEL;
  if (doc.admins.includes(e)) return { ok: false, error: "a conta admin ve tudo" };
  const lista = paginas === "todas" ? "todas" : (Array.isArray(paginas) ? paginas : []).filter((p) => IDS.includes(p));
  doc.perfis[e] = { ...(doc.perfis[e] || {}), paginas: lista, criadoEm: doc.perfis[e]?.criadoEm || new Date().toISOString() };
  await gravar(doc);
  return { ok: true };
}

export async function removerPerfil(email) {
  const e = norm(email);
  const doc = await ler();
  if (!doc) return ILEGIVEL;
  if (doc.admins.includes(e)) return { ok: false, error: "nao da para remover a conta admin" };
  delete doc.perfis[e];
  await gravar(doc);
  return { ok: true };
}

/* Tornar ou tirar admin. Sempre fica ao menos uma: sem admin ninguem
   libera aba nem cria conta. Quem deixa de ser admin volta para as abas
   que o perfil ja tinha. */
export async function definirAdmin(email, ligar) {
  const e = norm(email);
  if (!e) return { ok: false, error: "email invalido" };
  const doc = await ler();
  if (!doc) return ILEGIVEL;
  if (ligar) {
    if (!doc.admins.includes(e)) doc.admins.push(e);
    doc.perfis[e] = { paginas: [], criadoEm: new Date().toISOString(), ...(doc.perfis[e] || {}) };
  } else {
    if (!doc.admins.includes(e)) return { ok: true };
    if (doc.admins.length === 1) return { ok: false, error: "precisa ficar ao menos uma conta admin" };
    doc.admins = doc.admins.filter((x) => x !== e);
  }
  await gravar(doc);
  return { ok: true };
}

/* Senha que a admin definiu vale como provisoria ate a pessoa trocar por
   uma so dela. */
export async function marcarSenhaProvisoria(email, sim) {
  const e = norm(email);
  if (!e) return { ok: false, error: "email invalido" };
  const doc = await ler();
  if (!doc) return ILEGIVEL;
  if (!sim && !doc.perfis[e]) return { ok: true };
  const p = { paginas: [], criadoEm: new Date().toISOString(), ...(doc.perfis[e] || {}) };
  if (sim) p.senhaProvisoria = true;
  else delete p.senhaProvisoria;
  doc.perfis[e] = p;
  await gravar(doc);
  return { ok: true };
}

/* E-mails que este painel administra. A chave de servico do Supabase alcanca
   o projeto inteiro; contas.js so lista e troca senha de quem esta aqui.
   Arquivo ilegivel = ninguem. */
export async function emailsDoPainel() {
  const doc = await ler();
  if (!doc) return new Set();
  return new Set([...doc.admins, ...Object.keys(doc.perfis)].map(norm).filter(Boolean));
}
