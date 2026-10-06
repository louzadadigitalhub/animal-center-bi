/* Receita total = o card de Vendas › Recebimentos, com o período
   marcado no calendário: dia 1 até o último dia daquele mês.
   Setembro é 01/09–30/09. Agosto é 01/08–31/08. Outubro não apaga
   setembro: cada mês fica na sua gaveta. */

export function periodoDoMes(year, month0) {
  const mm = String(month0 + 1).padStart(2, "0");
  const last = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const from = `01/${mm}/${year}`;
  const to = `${String(last).padStart(2, "0")}/${mm}/${year}`;
  return { year, month0, from, to, chave: `${year}-${mm}` };
}

/* O mês só está "pronto" se a leitura aconteceu depois do último dia.
   Ler setembro no dia 30 ainda pode mudar; ler em outubro, não. */
export function leituraFechada(salvo, periodo) {
  if (!salvo || !periodo) return false;
  const total = Number(salvo.receitaTotalExata ?? salvo.receitaTotal);
  if (!Number.isFinite(total)) return false;
  if (salvo.from !== periodo.from || salvo.to !== periodo.to) return false;
  const lido = String(salvo.at || "").slice(0, 10);
  const [dd, mm, yy] = periodo.to.split("/");
  return /^\d{4}-\d{2}-\d{2}$/.test(lido) && lido > `${yy}-${mm}-${dd}`;
}

/* O mês aberto entra sempre (o dinheiro de hoje ainda cai nele).
   O mês que acabou de fechar também: uma baixa lançada nos primeiros
   dias ainda pode cair nele. Os outros só entram se ainda não tiverem
   card lido depois do último dia, do mais novo para o mais velho. */
export function filaDeMeses(agora, { anoInicio, jaLidos = {}, limite = 14 } = {}) {
  const ano0 = Number(anoInicio) || agora.y;
  const max = Math.max(1, Number(limite) || 14);
  const fila = [{ ...periodoDoMes(agora.y, agora.m - 1), aberto: true }];
  const anterior = agora.m === 1 ? periodoDoMes(agora.y - 1, 11) : periodoDoMes(agora.y, agora.m - 2);
  if (anterior.year >= ano0 && fila.length < max) fila.push({ ...anterior, aberto: false });
  const jaNaFila = new Set(fila.map((m) => m.chave));
  for (let y = agora.y; y >= ano0; y--) {
    const ate = y === agora.y ? agora.m - 1 : 12;
    for (let m = ate; m >= 1; m--) {
      if (fila.length >= max) return fila;
      const p = periodoDoMes(y, m - 1);
      if (jaNaFila.has(p.chave) || leituraFechada(jaLidos[p.chave], p)) continue;
      jaNaFila.add(p.chave);
      fila.push({ ...p, aberto: false });
    }
  }
  return fila;
}

export function periodoBate(lido, from, to) {
  const t = String(lido || "").replace(/\s/g, "");
  return t.includes(from) && t.includes(to);
}

function numeroDe(of) {
  if (!of) return null;
  const n = Number(of.receitaTotalExata ?? of.receitaTotal);
  return Number.isFinite(n) ? n : null;
}

function legadoBate(of, year, month0) {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(String(of?.period || ""));
  if (!m || numeroDe(of) == null) return false;
  return Number(m[3]) === year && Number(m[2]) - 1 === month0;
}

export function somarOficiais(a, b) {
  const cent = (n) => Math.round(n * 100) / 100;
  const total = cent(numeroDe(a) + numeroDe(b));
  let dailyFat = null;
  if (a.dailyFat?.length && b.dailyFat?.length) {
    const n = Math.max(a.dailyFat.length, b.dailyFat.length);
    dailyFat = Array.from({ length: n }, (_, i) => ({
      d: i + 1,
      fat: Math.round((a.dailyFat[i]?.fat || 0) + (b.dailyFat[i]?.fat || 0)),
    }));
    if (!dailyFat.some((d) => d.fat)) dailyFat = null;
  }
  return {
    receitaTotal: Math.round(total),
    receitaTotalExata: total,
    noDia: Math.round((a.noDia || 0) + (b.noDia || 0)),
    posteriores: Math.round((a.posteriores || 0) + (b.posteriores || 0)),
    adiantamento: Math.round((a.adiantamento || 0) + (b.adiantamento || 0)),
    emAberto: Math.round((a.emAberto || 0) + (b.emAberto || 0)),
    from: a.from,
    to: a.to,
    chave: a.chave,
    at: String(a.at || "") > String(b.at || "") ? a.at : b.at,
    period: a.period,
    dailyFat,
  };
}

/* O card daquele mês. Sem card, devolve null — quem chama é que decide
   se mostra as baixas, e tem que dizer que não é o card. */
export function oficialDoMes(snap, unit, year, month0) {
  const meses = snap?.snapshot?.caixaOficialMeses;
  const chave = periodoDoMes(year, month0).chave;
  if (unit === "consolidado") {
    const a = meses?.matriz?.[chave];
    const b = meses?.filial?.[chave];
    if (numeroDe(a) != null && numeroDe(b) != null) return somarOficiais(a, b);
    if (meses && !meses.filial && numeroDe(a) != null) return a;
    if (meses && !meses.matriz && numeroDe(b) != null) return b;
    const legado = snap?.snapshot?.caixaOficial?.consolidado;
    if (legadoBate(legado, year, month0)) return legado;
    return null;
  }
  const direto = meses?.[unit]?.[chave];
  if (numeroDe(direto) != null) return direto;
  const legado = snap?.snapshot?.caixaOficial?.[unit];
  if (legadoBate(legado, year, month0)) return legado;
  return null;
}

const reais = (s) => Number(String(s ?? "").replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;

/* Soma do Líquido das vendas baixadas, pelo mês da Data baixa. É o que
   o card Receita total conta: de set/2025 a out/2026 os dois ficaram
   entre 0,96 e 1,01 um do outro. Serve para recusar uma leitura que
   pegou a tela errada. */
export function baixasPorMesDeBaixa(rows) {
  const out = {};
  for (const r of rows || []) {
    if (!/baix/i.test(String(r["Status da venda"] || ""))) continue;
    const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(String(r["Data baixa"] || ""));
    if (!m) continue;
    const u = r._sede || "matriz";
    const k = `${m[3]}-${m[2]}`;
    (out[u] ??= {})[k] = (out[u][k] || 0) + reais(r["Líquido"]);
  }
  return out;
}

/* Até 20% de distância das baixas, ou R$ 1.000 em mês quase parado. */
export function cardConfere(card, baixas) {
  if (card == null || card === "") return false;
  const c = Number(card);
  const b = Number(baixas) || 0;
  if (!Number.isFinite(c)) return false;
  return Math.abs(c - b) <= Math.max(1000, 0.2 * b);
}
