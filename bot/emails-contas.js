/* Cobranças que chegaram nas caixas de e-mail da clínica.

   Abre cada caixa MAIL_n_* por IMAP (senha de app do Gmail, só no
   ambiente do servidor), separa as mensagens dos últimos dias que parecem
   cobrança — pelo assunto ou por trazer XML/PDF — e tira valor,
   vencimento e fornecedor: do XML da NF-e (parcelas), da linha digitável
   do boleto em PDF ou, sem anexo, do texto. Lembra o que já leu.

   Quem chama: robo.js, na rodada das contas. Grava
   /data/agentes/contas-email.json; quem lê é a rota /api/contas. */

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { lerBoletos, lerNfe, valorEVencimentoDoTexto } from "./contas-quinta.js";

const PARECE = /boleto|nota fiscal|\bnf-?e?\b|fatura|venc[ie]|cobran[cç]a|duplicata|pagamento|segunda via|2[ªa] via|\bxml\b/i;
const ANEXO_COBRANCA = /boleto|fatura|nf|nota|danfe|cobran|duplicata|\.xml$/i;
const DIA = 86400000;
const VERSAO = 2;

export function caixasDoAmbiente(env = process.env) {
  const lista = [];
  for (let i = 1; i <= 9; i++) {
    const email = env[`MAIL_${i}_EMAIL`];
    const senha = env[`MAIL_${i}_PASSWORD`];
    if (email && senha) lista.push({ nome: env[`MAIL_${i}_NOME`] || email, email, senha, host: env[`MAIL_${i}_HOST`] || "imap.gmail.com" });
  }
  return lista;
}

/* Anexos da estrutura da mensagem, sem baixar nada. */
function anexos(estrutura) {
  const lista = [];
  const visitar = (no) => {
    if (!no) return;
    const nome = no.dispositionParameters?.filename || no.parameters?.name || "";
    if (nome || /pdf|xml/i.test(no.type || "")) lista.push({ nome, tipo: no.type || "" });
    for (const f of no.childNodes || []) visitar(f);
  };
  visitar(estrutura);
  return lista;
}

export function pareceCobranca(assunto, listaDeAnexos) {
  if (PARECE.test(assunto || "")) return true;
  return listaDeAnexos.some((a) => /xml/i.test(a.tipo) || /\.xml$/i.test(a.nome) || (/pdf/i.test(a.tipo + a.nome) && ANEXO_COBRANCA.test(a.nome)));
}

async function textoDoPdf(conteudo) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(conteudo), isEvalSupported: false, useSystemFonts: true }).promise;
  let texto = "";
  for (let p = 1; p <= Math.min(doc.numPages, 4); p++) {
    const pagina = await doc.getPage(p);
    texto += (await pagina.getTextContent()).items.map((i) => i.str).join(" ") + "\n";
  }
  await doc.destroy();
  return texto;
}

function remetente(parsed) {
  const de = parsed.from?.value?.[0] || {};
  return { nome: de.name || "", email: (de.address || "").toLowerCase() };
}

/* Uma mensagem pode trazer várias cobranças (NF-e com parcelas, um PDF
   com um boleto por parcela). Cada uma vira um item com id próprio. O
   boleto de cada PDF fica pendurado na parcela da nota com o mesmo valor
   e vencimento; o PDF é guardado para abrir na aba (guardarPdf). */
export async function cobrancasDaMensagem(parsed, chave, lerPdf = textoDoPdf, guardarPdf = async () => null) {
  const data = parsed.date || new Date();
  const de = remetente(parsed);
  const itens = [];
  const add = (x) => itens.push({ id: `${chave}:${itens.length}`, fornecedor: de.nome || de.email, ...x });
  const boletos = [];
  for (const a of parsed.attachments || []) {
    if (!/pdf/i.test(a.contentType) && !/\.pdf$/i.test(a.filename || "")) continue;
    const achados = lerBoletos(await lerPdf(a.content).catch(() => ""), data);
    if (!achados.length) continue;
    const pdf = await guardarPdf(a.content);
    for (const b of achados) boletos.push({ ...b, pdf });
  }
  if (!boletos.length) for (const b of lerBoletos(`${parsed.subject || ""}\n${parsed.text || ""}`, data)) boletos.push({ ...b, pdf: null });
  const usados = new Set();
  const boletoPara = (valor, vencimento) => {
    const i = boletos.findIndex(
      (b, k) => !usados.has(k) && b.valor != null && Math.round(b.valor * 100) === Math.round(Number(valor) * 100) &&
        (!b.vencimento || !vencimento || Math.abs(new Date(b.vencimento) - new Date(vencimento)) <= 3 * 86400000)
    );
    if (i < 0) return {};
    usados.add(i);
    return { linha: boletos[i].linha, pdf: boletos[i].pdf };
  };
  for (const a of parsed.attachments || []) {
    const nome = a.filename || "";
    if (!/xml/i.test(a.contentType) && !/\.xml$/i.test(nome)) continue;
    const n = lerNfe(a.content.toString("utf8"));
    if (!n) continue;
    const base = { fonte: "nfe", fornecedor: n.fornecedor, cnpj: n.cnpj, numero: n.numero };
    if (n.parcelas.length) for (const p of n.parcelas) add({ ...base, valor: p.valor, vencimento: p.vencimento, ...boletoPara(p.valor, p.vencimento) });
    else add({ ...base, valor: n.valorTotal, vencimento: null, ...boletoPara(n.valorTotal, null) });
  }
  boletos.forEach((b, k) => {
    if (!usados.has(k)) add({ fonte: "boleto", valor: b.valor, vencimento: b.vencimento, tipoBoleto: b.tipo, linha: b.linha, pdf: b.pdf });
  });
  if (!itens.length) {
    const t = valorEVencimentoDoTexto(`${parsed.subject || ""}\n${parsed.text || ""}`, data);
    if (t.valor != null || t.vencimento) add({ fonte: "texto", ...t });
  }
  return itens;
}

async function lerCaixa(caixa, { desde, jaLidos, limite = 150, guardarPdf }) {
  const cliente = new ImapFlow({ host: caixa.host, port: 993, secure: true, auth: { user: caixa.email, pass: caixa.senha }, logger: false });
  const novas = {};
  await cliente.connect();
  const trava = await cliente.getMailboxLock("INBOX");
  try {
    const uids = (await cliente.search({ since: desde }, { uid: true })) || [];
    const candidatas = [];
    for await (const m of cliente.fetch(uids.slice(-600), { uid: true, envelope: true, bodyStructure: true }, { uid: true })) {
      const chave = `${caixa.email}:${m.envelope?.messageId || m.uid}`;
      if (jaLidos.has(chave)) continue;
      if (pareceCobranca(m.envelope?.subject, anexos(m.bodyStructure))) candidatas.push({ uid: m.uid, chave });
    }
    for (const c of candidatas.slice(-limite)) {
      const { content } = await cliente.download(String(c.uid), undefined, { uid: true });
      const parsed = await simpleParser(content);
      const de = remetente(parsed);
      novas[c.chave] = {
        caixa: caixa.nome,
        de: de.email,
        assunto: parsed.subject || "",
        data: (parsed.date || new Date()).toISOString().slice(0, 10),
        itens: (await cobrancasDaMensagem(parsed, c.chave, undefined, guardarPdf)).map((i) => ({ ...i, caixa: caixa.nome, de: de.email, assunto: parsed.subject || "" })),
      };
    }
  } finally {
    trava.release();
    await cliente.logout().catch(() => {});
  }
  return novas;
}

export async function atualizarCobrancas(dataDir, { env = process.env, agora = new Date(), dias = 40 } = {}) {
  const arq = join(dataDir, "agentes", "contas-email.json");
  let guardado = { mensagens: {} };
  try {
    guardado = JSON.parse(await readFile(arq, "utf8"));
  } catch {
    /* primeira vez */
  }
  /* Versão 2 guarda a linha digitável e o PDF do boleto: o que foi lido
     antes disso é lido de novo uma vez. */
  if ((guardado.versao || 1) < VERSAO) guardado = { mensagens: {} };
  const pastaBoletos = join(dataDir, "agentes", "boletos");
  await mkdir(pastaBoletos, { recursive: true });
  const guardarPdf = async (conteudo) => {
    const id = createHash("sha1").update(conteudo).digest("hex");
    await writeFile(join(pastaBoletos, `${id}.pdf`), conteudo);
    return id;
  };
  const desde = new Date(agora.getTime() - dias * DIA);
  const corte = new Date(agora.getTime() - 90 * DIA).toISOString().slice(0, 10);
  const mensagens = Object.fromEntries(Object.entries(guardado.mensagens || {}).filter(([, m]) => m.data >= corte));
  const jaLidos = new Set(Object.keys(mensagens));
  const caixas = caixasDoAmbiente(env);
  const erros = [];
  let novas = 0;
  for (const c of caixas) {
    try {
      const r = await lerCaixa(c, { desde, jaLidos, guardarPdf });
      novas += Object.keys(r).length;
      Object.assign(mensagens, r);
    } catch (e) {
      erros.push(`${c.nome}: ${e.responseText || e.message}`);
    }
  }
  /* PDF que nenhuma mensagem guardada usa mais (passou de 90 dias) sai. */
  const emUso = new Set(Object.values(mensagens).flatMap((m) => (m.itens || []).map((i) => i.pdf).filter(Boolean)));
  for (const f of await readdir(pastaBoletos).catch(() => [])) {
    if (!emUso.has(f.replace(/\.pdf$/, ""))) await rm(join(pastaBoletos, f), { force: true });
  }
  await writeFile(arq, JSON.stringify({ versao: VERSAO, lidoEm: new Date().toISOString(), caixas: caixas.map((c) => c.nome), erros, mensagens }));
  return { caixas: caixas.length, novas, total: Object.keys(mensagens).length, erros };
}

export { itensDasMensagens } from "./contas-quinta.js";
