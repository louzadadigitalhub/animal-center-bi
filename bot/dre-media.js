/* DRE por categoria contra a média dos 12 meses anteriores.

   Para cada conta dos quatro grupos de despesa (e até duas camadas
   abaixo), o valor do mês pedido ao lado da média dos 12 meses antes
   dele, com a diferença em R$ e em %. Média conta os meses que existem
   no demonstrativo, inclusive os de valor zero (a conta que só aparece
   de vez em quando tem média baixa de verdade); mês antes de a unidade
   abrir não conta.

   Não tem dia de corte: o Demonstrativo do SimplesVet vem fechado por
   mês, sem o dia de cada lançamento. */
import { GRUPOS_DESPESA, lerDre } from "./dre.js";

const semAcento = (t) =>
  String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const r2 = (n) => Math.round(n * 100) / 100;
const PROFUNDIDADE = 2;
const ALVOS = new Set(GRUPOS_DESPESA.map(semAcento));

/* Contas de despesa de um bloco, cada uma com o caminho desde o grupo
   ("despesas operacionais > pessoal > salarios") e os valores
   positivos. */
export function contasDeDespesa(bloco) {
  const out = [];
  let grupo = null;
  const pilha = [];
  for (const l of bloco?.linhas || []) {
    const n = semAcento(l.nome);
    if (grupo && l.nivel <= grupo.nivel) grupo = null;
    if (!grupo && ALVOS.has(n)) {
      grupo = { nivel: l.nivel, nome: l.nome };
      pilha.length = 0;
      pilha.push(n);
      out.push({ caminho: n, grupo: l.nome, nome: l.nome, profundidade: 0, valores: l.valores.map((v) => -(v || 0)) });
      continue;
    }
    if (!grupo) continue;
    const prof = l.nivel - grupo.nivel;
    pilha.length = prof;
    pilha[prof] = n;
    if (prof > PROFUNDIDADE) continue;
    out.push({ caminho: pilha.join(" > "), grupo: grupo.nome, nome: l.nome, profundidade: prof, valores: l.valores.map((v) => -(v || 0)) });
  }
  return out;
}

const chaveMes = (ano, m0) => `${String(m0 + 1).padStart(2, "0")}/${ano}`;

/* Os 12 meses antes de (ano, m0), do mais antigo ao mais novo. */
export function dozeAntes(ano, m0) {
  const out = [];
  for (let k = 12; k >= 1; k--) {
    const t = ano * 12 + m0 - k;
    out.push({ ano: Math.floor(t / 12), m0: t % 12 });
  }
  return out;
}

/* dres: { [ano]: dados do lerDre }. Puro, para testar sem arquivo. */
export function compararComMedia(dres, { unit = "consolidado", ano, mes }) {
  const unidades = unit === "consolidado" ? ["matriz", "filial"] : [unit];
  const janela = dozeAntes(ano, mes);
  const contas = new Map();
  const mesesComDado = new Set();
  let temMes = false;
  for (const u of unidades) {
    const porAno = (a) => dres[a]?.unidades?.[u];
    const atual = porAno(ano);
    const iAtual = atual?.meses?.indexOf(chaveMes(ano, mes)) ?? -1;
    if (iAtual >= 0) temMes = true;
    const blocos = new Map();
    for (const a of new Set([ano, ...janela.map((j) => j.ano)])) {
      const b = porAno(a);
      if (b) blocos.set(a, { bloco: b, contas: contasDeDespesa(b) });
    }
    for (const [a, { bloco, contas: lista }] of blocos) {
      for (const c of lista) {
        let x = contas.get(c.caminho);
        if (!x) contas.set(c.caminho, (x = { caminho: c.caminho, grupo: c.grupo, nome: c.nome, profundidade: c.profundidade, valor: 0, porMes: new Map() }));
        if (a === ano && iAtual >= 0) x.valor += c.valores[iAtual] || 0;
        for (const j of janela) {
          if (j.ano !== a) continue;
          const i = bloco.meses.indexOf(chaveMes(j.ano, j.m0));
          if (i < 0) continue;
          const k = `${j.ano}-${j.m0}`;
          mesesComDado.add(k);
          x.porMes.set(k, (x.porMes.get(k) || 0) + (c.valores[i] || 0));
        }
      }
    }
  }
  const n = mesesComDado.size;
  const linhas = [];
  for (const x of contas.values()) {
    let soma = 0;
    for (const k of mesesComDado) soma += x.porMes.get(k) || 0;
    const media = n ? soma / n : null;
    if (!x.valor && !media) continue;
    const dif = media == null ? null : x.valor - media;
    linhas.push({
      caminho: x.caminho,
      grupo: x.grupo,
      nome: x.nome,
      profundidade: x.profundidade,
      valor: r2(x.valor),
      media: media == null ? null : r2(media),
      dif: dif == null ? null : r2(dif),
      pct: media ? r2((dif / media) * 100) : null,
    });
  }
  /* Ordem da árvore: grupo, depois as contas de dentro na ordem do caminho. */
  const ordemGrupo = (g) => GRUPOS_DESPESA.map(semAcento).indexOf(semAcento(g));
  linhas.sort((a, b) => ordemGrupo(a.grupo) - ordemGrupo(b.grupo) || a.caminho.localeCompare(b.caminho, "pt-BR"));
  return { unit, ano, mes, temMes, mesesNaMedia: n, linhas };
}

export async function dreContraMedia(dataDir, { unit, ano, mes }) {
  const dres = {};
  for (const a of new Set([ano, ano - 1])) dres[a] = await lerDre(dataDir, a).catch(() => null);
  return compararComMedia(dres, { unit, ano, mes });
}
