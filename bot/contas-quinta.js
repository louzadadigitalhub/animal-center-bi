/* Contas da quinta-feira: o que pagar, o que está atrasado e o que chegou
   por e-mail sem estar lançado no SimplesVet.

   Tudo aqui é puro (sem rede, sem disco) para ser testado: boleto, NF-e,
   texto do e-mail, a semana da quinta e o cruzamento. Quem lê o SimplesVet
   é pagar-sv.js; quem lê as caixas é emails-contas.js; quem junta tudo é
   a rota /api/contas.

   Regra da clínica (passagem de função, set/2026): na quinta paga-se o que
   vence daquele dia até a quinta seguinte. A janela aqui vai de quinta a
   quarta — o que vence na outra quinta entra na lista daquela quinta, e
   assim nada aparece em duas semanas. */

const DIA = 86400000;

function data(iso) {
  return new Date(`${iso}T12:00:00Z`);
}

function iso(d) {
  return d.toISOString().slice(0, 10);
}

function somarDias(isoData, dias) {
  return iso(new Date(data(isoData).getTime() + dias * DIA));
}

function hojeEmSaoPaulo(agora) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(agora)
      .map((x) => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day}`;
}

const centavos = (n) => Math.round(Number(n) * 100);

/* ---------- Boleto ---------- */

/* Dígito verificador módulo 10 (Febraban): da direita para a esquerda,
   pesos 2,1,2,1...; soma os algarismos dos produtos. */
export function mod10(numero) {
  let soma = 0;
  let peso = 2;
  for (let i = numero.length - 1; i >= 0; i--) {
    let p = Number(numero[i]) * peso;
    if (p > 9) p = Math.floor(p / 10) + (p % 10);
    soma += p;
    peso = peso === 2 ? 1 : 2;
  }
  return String((10 - (soma % 10)) % 10);
}

function mod11Barras(barras) {
  const sem = barras.slice(0, 4) + barras.slice(5);
  let soma = 0;
  let peso = 2;
  for (let i = sem.length - 1; i >= 0; i--) {
    soma += Number(sem[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const dv = 11 - (soma % 11);
  return String(dv === 0 || dv === 10 || dv === 11 ? 1 : dv);
}

/* O fator de vencimento conta dias desde 07/10/1997 e chegou a 9999 em
   21/02/2025; desde 22/02/2025 recomeça em 1000. O mesmo fator serve aos
   dois ciclos: fica a data mais perto de quando o e-mail chegou. */
function vencimentoDoFator(fator, referencia) {
  const f = Number(fator);
  if (!f) return null;
  const antigo = Date.UTC(1997, 9, 7) + f * DIA;
  const novo = Date.UTC(2025, 1, 22) + (f - 1000) * DIA;
  const ref = referencia.getTime();
  return iso(new Date(Math.abs(novo - ref) <= Math.abs(antigo - ref) ? novo : antigo));
}

function deBarrasBancario(barras, referencia) {
  if (barras.length !== 44 || barras[3] !== "9" || barras[4] !== mod11Barras(barras)) return null;
  return {
    tipo: "bancario",
    valor: Number(barras.slice(9, 19)) / 100,
    vencimento: vencimentoDoFator(barras.slice(5, 9), referencia),
    linha: barras,
  };
}

function deLinhaBancaria(d, referencia) {
  const c1 = d.slice(0, 10), c2 = d.slice(10, 21), c3 = d.slice(21, 32);
  if (d[3] !== "9") return null;
  if (mod10(c1.slice(0, 9)) !== c1[9] || mod10(c2.slice(0, 10)) !== c2[10] || mod10(c3.slice(0, 10)) !== c3[10]) return null;
  return {
    tipo: "bancario",
    valor: Number(d.slice(37, 47)) / 100,
    vencimento: vencimentoDoFator(d.slice(33, 37), referencia),
    linha: d,
  };
}

/* Conta de consumo (luz, água, telefone): 4 blocos de 11 + DV. O valor só
   é dinheiro quando o 3º dígito é 6 ou 8; o vencimento não tem lugar fixo. */
function deArrecadacao(d) {
  const blocos = [0, 1, 2, 3].map((i) => d.slice(i * 12, i * 12 + 12));
  if (blocos.some((b) => b.length !== 12)) return null;
  const modulo10 = d[2] === "6" || d[2] === "7";
  if (modulo10 && blocos.some((b) => mod10(b.slice(0, 11)) !== b[11])) return null;
  const barras = blocos.map((b) => b.slice(0, 11)).join("");
  const valor = d[2] === "6" || d[2] === "8" ? Number(barras.slice(4, 15)) / 100 : null;
  return { tipo: "arrecadacao", valor, vencimento: null, linha: d };
}

export function lerBoleto(texto, referencia = new Date()) {
  const candidatos = String(texto || "").match(/\d[\d.\s-]{38,70}\d/g) || [];
  for (const c of candidatos) {
    const d = c.replace(/\D/g, "");
    let b = null;
    if (d.length === 47) b = deLinhaBancaria(d, referencia);
    else if (d.length === 48 && d[0] === "8") b = deArrecadacao(d);
    else if (d.length === 44 && d[0] !== "8") b = deBarrasBancario(d, referencia);
    if (b) return b;
  }
  return null;
}

/* ---------- NF-e ---------- */

const tag = (xml, nome) => (xml.match(new RegExp(`<${nome}>([^<]*)</${nome}>`)) || [])[1] || null;

export function lerNfe(xml) {
  const s = String(xml || "");
  if (!/<infNFe[\s>]/.test(s)) return null;
  const emit = (s.match(/<emit>([\s\S]*?)<\/emit>/) || [])[1] || "";
  const parcelas = [...s.matchAll(/<dup>([\s\S]*?)<\/dup>/g)].map((m) => ({
    numero: tag(m[1], "nDup"),
    vencimento: tag(m[1], "dVenc"),
    valor: Number(tag(m[1], "vDup")),
  }));
  return {
    cnpj: tag(emit, "CNPJ") || tag(emit, "CPF"),
    fornecedor: tag(emit, "xNome"),
    numero: tag(s, "nNF"),
    valorTotal: Number(tag(s, "vNF")) || null,
    parcelas,
  };
}

/* ---------- Texto do e-mail ---------- */

export function valorEVencimentoDoTexto(texto, referencia = new Date()) {
  const t = String(texto || "");
  const v = t.match(/(?:R\$\s*|valor\b[^0-9\n]{0,15})(\d{1,3}(?:\.\d{3})*,\d{2})/i);
  const valor = v ? Number(v[1].replace(/\./g, "").replace(",", ".")) : null;
  const d = t.match(/venc\w*[^0-9\n]{0,20}(\d{2})\/(\d{2})(?:\/(\d{2,4}))?/i);
  let vencimento = null;
  if (d) {
    const ref = hojeEmSaoPaulo(referencia);
    const ano = d[3] ? Number(d[3].length === 2 ? "20" + d[3] : d[3]) : Number(ref.slice(0, 4));
    let cand = `${ano}-${d[2]}-${d[1]}`;
    if (!d[3] && cand < somarDias(ref, -180)) cand = `${ano + 1}-${d[2]}-${d[1]}`;
    vencimento = cand;
  }
  return { valor, vencimento };
}

/* ---------- Semana e cruzamento ---------- */

export function semanaDaQuinta(agora = new Date()) {
  const hoje = hojeEmSaoPaulo(agora);
  const dow = data(hoje).getUTCDay(); // 4 = quinta
  const quinta = somarDias(hoje, (4 - dow + 7) % 7);
  return { quinta, ate: somarDias(quinta, 6) };
}

const PALAVRAS_FORA = new Set(["ltda", "comercio", "servicos", "servico", "eireli", "distribuidora", "industria", "produtos", "brasil", "cobranca", "financeiro", "boleto", "nota", "fiscal", "gmail", "hotmail", "outlook"]);

function palavras(s) {
  return new Set(
    String(s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((p) => p.length >= 4 && !PALAVRAS_FORA.has(p))
  );
}

/* E-mail x SimplesVet: o valor tem de bater ao centavo, e além dele o
   vencimento (até 5 dias de diferença) ou o fornecedor. Cada conta do
   SimplesVet casa com um e-mail só. Devolve id do e-mail -> "unidade:id". */
export function cruzar(sv, emails) {
  const usados = new Set();
  const resultado = new Map();
  for (const e of emails || []) {
    if (e.valor == null) continue;
    const pe = palavras(`${e.fornecedor || ""} ${e.de || ""}`);
    let melhor = null;
    let nota = 0;
    for (const s of sv || []) {
      const chave = `${s.unidade}:${s.id}`;
      if (usados.has(chave) || centavos(s.valor) !== centavos(e.valor)) continue;
      let n = 0;
      if (e.vencimento && s.vencimento && Math.abs(data(e.vencimento) - data(s.vencimento)) <= 5 * DIA) n += 2;
      const ps = palavras(`${s.fornecedor || ""} ${s.descricao || ""}`);
      if ([...pe].some((p) => ps.has(p))) n += 1;
      if (n > nota) {
        melhor = chave;
        nota = n;
      }
    }
    if (melhor) {
      usados.add(melhor);
      resultado.set(e.id, melhor);
    }
  }
  return resultado;
}

/* A mesma conta chega mais de uma vez: dois e-mails com o mesmo boleto,
   ou a nota de um lado e o boleto do outro. Mesmo valor e vencimento até
   2 dias de diferença viram um item só; fica a fonte mais confiável
   (nota > boleto > texto) e a lista de onde cada cópia veio. */
const CONFIANCA = { nfe: 3, boleto: 2, texto: 1 };

export function unirDuplicadas(emails) {
  const grupos = [];
  for (const e of emails || []) {
    const g = e.valor != null && e.vencimento
      ? grupos.find((x) => centavos(x.valor) === centavos(e.valor) && x.vencimento && Math.abs(data(x.vencimento) - data(e.vencimento)) <= 2 * DIA)
      : null;
    if (!g) {
      grupos.push({ ...e, ids: [e.id], vezes: 1 });
      continue;
    }
    g.ids.push(e.id);
    g.vezes += 1;
    if ((CONFIANCA[e.fonte] || 0) > (CONFIANCA[g.fonte] || 0)) Object.assign(g, { ...e, id: g.id, ids: g.ids, vezes: g.vezes });
  }
  return grupos;
}

const soma = (lista) => Math.round(lista.reduce((a, x) => a + Number(x.valor || 0), 0) * 100) / 100;

export function montarSemana({ sv = [], emails = [], hoje = new Date() } = {}) {
  const semana = semanaDaQuinta(hoje);
  emails = unirDuplicadas(emails);
  const casou = cruzar(sv, emails);
  const comEmail = new Set(casou.values());
  const abertas = sv.filter((s) => !s.pago);
  const marcar = (s) => ({ ...s, cobrancaRecebida: comEmail.has(`${s.unidade}:${s.id}`) });
  const pagar = abertas
    .filter((s) => s.vencimento >= semana.quinta && s.vencimento <= semana.ate)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
    .map(marcar);
  const atrasadas = abertas
    .filter((s) => s.vencimento < semana.quinta)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))
    .map(marcar);
  /* Cobrança sem lançamento: tem valor e vencimento, vence até a quarta
     da semana e não passou mais de 15 dias. Nota sem parcela (pode ser
     remessa ou consignação) e aviso com vencimento mas sem valor vão para
     "conferir". Texto sem vencimento é recibo de compra já paga: fica fora. */
  const desde = somarDias(semana.quinta, -15);
  const soltas = emails.filter((e) => !casou.has(e.id));
  const naoLancadas = soltas
    .filter((e) => e.valor != null && e.vencimento && e.vencimento >= desde && e.vencimento <= semana.ate)
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
  const conferir = soltas
    .filter(
      (e) =>
        (e.fonte === "nfe" && !e.vencimento && (e.data || "") >= desde) ||
        (e.valor == null && e.vencimento && e.vencimento >= desde && e.vencimento <= semana.ate)
    )
    .sort((a, b) => String(a.vencimento || a.data || "").localeCompare(String(b.vencimento || b.data || "")));
  return {
    semana,
    pagar,
    atrasadas,
    naoLancadas,
    conferir,
    totalPagar: soma(pagar),
    totalAtrasadas: soma(atrasadas),
    totalNaoLancadas: soma(naoLancadas),
  };
}

/* Achata as mensagens lidas das caixas em itens para o cruzamento. */
export function itensDasMensagens(mensagens) {
  return Object.values(mensagens || {}).flatMap((m) => (m.itens || []).map((i) => ({ data: m.data, ...i })));
}
