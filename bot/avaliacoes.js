/* Nota do tutor, de 0 a 10, por link no WhatsApp.

   A recepção gera um link por consulta (veterinário + paciente + dia) e
   manda pelo WhatsApp do próprio computador (wa.me); o tutor abre a página
   pública /avaliar/<token> e dá a nota. Cada link vale uma resposta só.

   O que fica guardado: o nome do veterinário, a unidade, o dia e um hash
   do paciente — nem nome nem telefone do tutor. */
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

const arq = (dataDir) => join(dataDir, "avaliacoes.json");
export const TOKEN = /^[A-Za-z0-9_-]{22}$/;
const DIA = /^\d{4}-\d{2}-\d{2}$/;

export async function lerAvaliacoes(dataDir) {
  try {
    const j = JSON.parse(await readFile(arq(dataDir), "utf8"));
    return { links: j.links || {}, respostas: j.respostas || {} };
  } catch {
    return { links: {}, respostas: {} };
  }
}

async function gravar(dataDir, dados) {
  await mkdir(dataDir, { recursive: true });
  const tmp = `${arq(dataDir)}.tmp`;
  await writeFile(tmp, JSON.stringify(dados));
  await rename(tmp, arq(dataDir));
}

/* Uma gravação por vez: dois tutores respondendo juntos não podem apagar
   a resposta um do outro. */
let fila = Promise.resolve();
const emFila = (f) => (fila = fila.then(f, f));

export const hashPaciente = (codigo, animal) =>
  createHash("sha1").update(`${String(codigo || "").trim()}|${String(animal || "").trim().toLowerCase()}`).digest("hex");

/* Mesmo veterinário, paciente e dia devolvem o mesmo link. */
export function criarLink(dataDir, { funcionario, unit, dia, codigo, animal, agora = new Date() }) {
  return emFila(async () => {
    if (!funcionario || !DIA.test(String(dia || ""))) throw new Error("consulta invalida");
    const paciente = hashPaciente(codigo, animal);
    const d = await lerAvaliacoes(dataDir);
    for (const [token, l] of Object.entries(d.links)) {
      if (l.funcionario === funcionario && l.dia === dia && l.paciente === paciente) return { token, respondida: Boolean(d.respostas[token]) };
    }
    const token = randomBytes(16).toString("base64url");
    d.links[token] = { criadoEm: agora.toISOString(), funcionario: String(funcionario), unit: unit === "filial" ? "filial" : "matriz", dia, paciente };
    await gravar(dataDir, d);
    return { token, respondida: false };
  });
}

/* O que a página pública mostra: só o primeiro nome de quem atendeu. */
export async function verLink(dataDir, token) {
  if (!TOKEN.test(String(token || ""))) return null;
  const d = await lerAvaliacoes(dataDir);
  const l = d.links[token];
  if (!l) return null;
  const primeiro = String(l.funcionario).replace(/^(dra?\.?|m\.?v\.?)\s+/i, "").split(/\s+/)[0];
  return { profissional: primeiro, clinica: l.unit === "filial" ? "Animal Center São Cristóvão" : "Animal Center", respondida: Boolean(d.respostas[token]) };
}

export function responder(dataDir, token, { nota, comentario = "" }, agora = new Date()) {
  return emFila(async () => {
    if (!TOKEN.test(String(token || ""))) throw new Error("link invalido");
    const n = Number(nota);
    if (!Number.isInteger(n) || n < 0 || n > 10) throw new Error("nota de 0 a 10");
    const d = await lerAvaliacoes(dataDir);
    if (!d.links[token]) throw new Error("link invalido");
    if (d.respostas[token]) throw new Error("ja respondida");
    d.respostas[token] = { nota: n, comentario: String(comentario || "").slice(0, 500).trim(), em: agora.toISOString() };
    await gravar(dataDir, d);
    return true;
  });
}

function doPeriodo(l, { ano, mes = "all", dia = null, unit = "consolidado" }) {
  if (unit !== "consolidado" && l.unit !== unit) return false;
  const [y, m, d] = l.dia.split("-").map(Number);
  return y === ano && (mes === "all" || m === mes + 1) && (!dia || d <= dia);
}

/* Notas por veterinário no período (pelo dia da consulta). mes 0-11 ou
   "all"; dia = dia de corte. */
export function notasDoPeriodo(dados, filtro) {
  const out = {};
  for (const [token, r] of Object.entries(dados.respostas || {})) {
    const l = dados.links?.[token];
    if (!l || !doPeriodo(l, filtro)) continue;
    const x = (out[l.funcionario] ??= { soma: 0, n: 0 });
    x.soma += r.nota;
    x.n += 1;
  }
  return out;
}

/* Para a aba Pesquisa: média, NPS, distribuição e os comentários mais
   recentes do período, sem identificar o tutor. */
export function resumoPesquisa(dados, filtro) {
  const distribuicao = Array(11).fill(0);
  const comentarios = [];
  let soma = 0;
  let n = 0;
  for (const [token, r] of Object.entries(dados.respostas || {})) {
    const l = dados.links?.[token];
    if (!l || !doPeriodo(l, filtro)) continue;
    distribuicao[r.nota] += 1;
    soma += r.nota;
    n += 1;
    if (r.comentario) comentarios.push({ nota: r.nota, comentario: r.comentario, dia: l.dia, funcionario: l.funcionario });
  }
  comentarios.sort((a, b) => b.dia.localeCompare(a.dia));
  const promotores = distribuicao[9] + distribuicao[10];
  const detratores = distribuicao.slice(0, 7).reduce((a, b) => a + b, 0);
  return {
    respostas: n,
    media: n ? Math.round((soma / n) * 100) / 100 : null,
    nps: n ? Math.round(((promotores - detratores) / n) * 100) : null,
    distribuicao,
    porVet: notasDoPeriodo(dados, filtro),
    comentarios: comentarios.slice(0, 30),
  };
}
