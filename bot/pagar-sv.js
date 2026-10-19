/* Contas a pagar do SimplesVet, nas duas unidades, pela API que a própria
   tela "Contas a pagar" usa: api.simples.vet/app/v1/financeiro/lancamentos.
   A sessão do navegador autentica (sem chave nem token). Vêm pagas e não
   pagas: uma cobrança do e-mail pode já ter sido lançada e paga.

   Quem chama: robo.js, na rodada das contas. Grava
   /data/agentes/pagar-sv.json; quem lê é a rota /api/contas. */

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { gotoResiliente, opcoesChrome, esperarAmbientesOuPainel, escolherAmbiente } from "./chrome.js";

const LOGIN = process.env.SIMPLES_VET_LOGIN_URL || "https://app.simples.vet/login/login.php";
const TELA = "https://app.simples.vet/v3/financeiro/contas-a-pagar";
const API = "https://api.simples.vet/app/";
const DIA = 86400000;

const unitDoNome = (n) => {
  const t = String(n || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return /cristovao|filial/.test(t) ? "filial" : "matriz";
};

export function lancamento(x, unidade) {
  const principal = (x.categorias || []).find((c) => c.principal) || (x.categorias || [])[0];
  return {
    unidade,
    id: String(x.id),
    fornecedor: x.fornecedor?.nome || null,
    descricao: String(x.descricao || "").trim(),
    valor: Number(x.valor),
    vencimento: x.vencimento,
    competencia: x.competencia || null,
    pago: x.foi_pago === "Sim" || x.status_formatado === "Pago",
    status: x.status_formatado || x.status || null,
    parcela: x.parcela && x.parcela !== "..." ? x.parcela : x.numero_parcela || null,
    categoria: principal?.nome || null,
  };
}

async function entrar(page, ambId) {
  if (!process.env.SIMPLES_VET_EMAIL || !process.env.SIMPLES_VET_PASSWORD) throw new Error("SIMPLES_VET_EMAIL/PASSWORD ausentes");
  await gotoResiliente(page, LOGIN);
  await page.locator('input[type="email"], input[placeholder="Email"]').first().fill(process.env.SIMPLES_VET_EMAIL);
  await page.locator('input[type="password"]').first().fill(process.env.SIMPLES_VET_PASSWORD);
  await page.getByRole("button", { name: /Entrar no SimplesVet/i }).click();
  await esperarAmbientesOuPainel(page);
  const ambientes = await page.evaluate(() =>
    [...document.querySelectorAll("#ambientes .celx")].map((el) => ({
      id: el.getAttribute("data-id") || "",
      nome: (el.querySelector("h4")?.innerText || "").trim(),
    }))
  );
  await escolherAmbiente(page, ambId);
  return ambientes;
}

/* A API devolve 100 por página; a próxima vem em _links.next. */
async function lancamentosDaUnidade(page, periodo) {
  const lista = [];
  let url = `${API}v1/financeiro/lancamentos?periodo=${encodeURIComponent(periodo)}&natureza=D&per_page=100&page=1`;
  for (let i = 0; i < 30 && url; i++) {
    const r = await page.request.get(url, { headers: { accept: "application/json" } });
    if (!r.ok()) throw new Error(`API de lançamentos respondeu ${r.status()}`);
    const j = await r.json();
    lista.push(...(j.data || []));
    url = j._links?.next ? new URL(j._links.next, API).href : null;
  }
  return lista;
}

export async function collectContasPagar(dataDir, { agora = new Date(), diasAntes = 45, diasDepois = 45 } = {}) {
  const iso = (t) => new Date(t).toISOString().slice(0, 10);
  const de = iso(agora.getTime() - diasAntes * DIA);
  const ate = iso(agora.getTime() + diasDepois * DIA);
  const browser = await chromium.launch(opcoesChrome());
  try {
    const page = await browser.newPage({ locale: "pt-BR", viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(60000);
    const ambientes = await entrar(page, "");
    const saida = { lidoEm: new Date().toISOString(), periodo: { de, ate }, unidades: {} };
    for (const amb of ambientes.length ? ambientes : [{ id: "", nome: "Animal Center" }]) {
      const unit = unitDoNome(amb.nome);
      if (amb.id && ambientes.length > 1) {
        await gotoResiliente(page, "https://app.simples.vet/login/logout.php");
        await entrar(page, amb.id);
      }
      /* A API só responde depois que a tela nova abriu a sessão dela. */
      await gotoResiliente(page, TELA);
      await page.waitForTimeout(3000);
      saida.unidades[unit] = (await lancamentosDaUnidade(page, `${de}|${ate}`)).map((x) => lancamento(x, unit));
    }
    await gotoResiliente(page, "https://app.simples.vet/login/logout.php").catch(() => {});
    await mkdir(join(dataDir, "agentes"), { recursive: true });
    await writeFile(join(dataDir, "agentes", "pagar-sv.json"), JSON.stringify(saida));
    return { de, ate, unidades: Object.fromEntries(Object.entries(saida.unidades).map(([u, l]) => [u, l.length])) };
  } finally {
    await browser.close().catch(() => {});
  }
}
