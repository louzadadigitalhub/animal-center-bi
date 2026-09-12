export const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
export const YEARS = [2023, 2024, 2025, 2026];

export const brl = (n) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export const num = (n) => n.toLocaleString("pt-BR");

const fatMatriz = {
  2023: [239022, 251400, 248100, 262000, 255800, 271200, 268400, 274900, 266100, 259000, 248700, 281400],
  2024: [312400, 298700, 321000, 334200, 329800, 341100, 338400, 352000, 344600, 331200, 318900, 361000],
  2025: [358200, 341000, 362400, 371800, 368200, 381400, 376900, 390200, 384100, 372000, 359400, 401200],
  2026: [401800, 388400, 412200, 421000, 418600, 432400, 428100, 441200, 144000, 0, 0, 0],
};

const fatFilial = {
  2023: [98000, 102400, 99400, 108200, 104100, 111800, 109400, 114200, 110800, 107400, 101200, 118600],
  2024: [128400, 121800, 132100, 138400, 134200, 141800, 139600, 146200, 142400, 136800, 129400, 151200],
  2025: [148200, 141000, 152400, 158100, 154800, 162400, 159200, 167800, 163400, 156200, 148800, 172400],
  2026: [171200, 164800, 178400, 182100, 179600, 186400, 183200, 191800, 86000, 0, 0, 0],
};

const vendasMatriz = {
  2023: [1847, 1910, 1880, 2010, 1960, 2104, 2080, 2140, 2060, 1990, 1920, 2210],
  2024: [2210, 2140, 2280, 2360, 2310, 2410, 2380, 2490, 2440, 2320, 2240, 2560],
  2025: [2480, 2390, 2520, 2580, 2540, 2640, 2600, 2710, 2660, 2570, 2480, 2780],
  2026: [2680, 2590, 2740, 2810, 2780, 2880, 2840, 2940, 258, 0, 0, 0],
};

const vendasFilial = {
  2023: [740, 780, 760, 820, 790, 860, 840, 890, 850, 820, 780, 920],
  2024: [910, 880, 940, 980, 950, 1020, 990, 1060, 1030, 980, 920, 1100],
  2025: [1040, 990, 1080, 1120, 1090, 1160, 1130, 1210, 1170, 1110, 1040, 1240],
  2026: [1180, 1120, 1240, 1280, 1250, 1320, 1290, 1380, 171, 0, 0, 0],
};

function sliceYear(arr, month) {
  if (month === "all") {
    const vals = arr.filter((v) => v > 0);
    return vals.reduce((a, b) => a + b, 0);
  }
  return arr[month] || 0;
}

function lastCompleteMonth(year) {
  if (year < 2026) return 11;
  return 8;
}

export function periodLabel(year, month) {
  if (month === "all") {
    if (year === 2026) return "Jan a Set 2026 (ao vivo ate 11/09)";
    return `Ano ${year} completo`;
  }
  const live = year === 2026 && month === 8 ? " · ao vivo ate o dia 11" : "";
  return `${MONTHS[month]} ${year}${live}`;
}

const gruposNomes = [
  "Internamento",
  "Consultas",
  "Exames",
  "Cirurgias",
  "Farmacia",
  "Vacinas",
  "Procedimentos",
];

const grupoShareM = [0.286, 0.228, 0.206, 0.128, 0.084, 0.05, 0.018];
const grupoShareF = [0.265, 0.249, 0.216, 0.107, 0.091, 0.048, 0.024];
const grupoMediaDelta = [1.04, 0.96, 1.06, 0.88, 1.03, 0.89, 1.08];

const origemNomes = ["Instagram", "Google", "Facebook", "Indicacao", "Outros"];

function buildUnit(id, nome, casa, fat, vendas, share, equipe, vacinas) {
  return { id, nome, casa, fat, vendas, share, equipe, vacinas };
}

const equipeM = [
  { nome: "Sthefani Klein", peso: 0.216, ticket: 650, novos: 9 },
  { nome: "Jessica Eduarda", peso: 0.197, ticket: 546, novos: 11 },
  { nome: "Thaina Almeida", peso: 0.153, ticket: 539, novos: 7 },
  { nome: "Victoria Hainzenreder", peso: 0.138, ticket: 521, novos: 6 },
  { nome: "Fernanda Vieira", peso: 0.114, ticket: 566, novos: 5 },
  { nome: "Luis Costa", peso: 0.092, ticket: 488, novos: 3 },
  { nome: "Animal Center", peso: 0.09, ticket: 238, novos: 4 },
];

const equipeF = [
  { nome: "Tais Scotta", peso: 0.22, ticket: 556, novos: 5 },
  { nome: "Joao SilvaAppel", peso: 0.188, ticket: 523, novos: 4 },
  { nome: "Lara Spagnol", peso: 0.164, ticket: 504, novos: 6 },
  { nome: "Francine Lagemann", peso: 0.137, ticket: 536, novos: 3 },
  { nome: "Greice Spellmeier", peso: 0.127, ticket: 519, novos: 2 },
  { nome: "Recepcao Sao Cristovao", peso: 0.164, ticket: 310, novos: 2 },
];

const vacinasBase = [
  { nome: "Polivalente", t: 96, a: 54 },
  { nome: "Antirrabica", t: 61, a: 28 },
  { nome: "Tosse dos canis", t: 24, a: 14 },
  { nome: "Quintupla", t: 14, a: 8 },
  { nome: "Giardia", t: 12, a: 7 },
];

export const UNITS_META = {
  matriz: buildUnit("matriz", "Matriz", "Animal Center", fatMatriz, vendasMatriz, grupoShareM, equipeM, vacinasBase),
  filial: buildUnit(
    "filial",
    "Filial 1",
    "Sao Cristovao",
    fatFilial,
    vendasFilial,
    grupoShareF,
    equipeF,
    vacinasBase.map((v) => ({ ...v, t: Math.round(v.t * 0.62), a: Math.round(v.a * 0.58) }))
  ),
};

function unitSlice(meta, year, month) {
  const fat = sliceYear(meta.fat[year], month);
  const qtd = sliceYear(meta.vendas[year], month);
  const liveScale = year === 2026 && month === 8 ? 11 / 30 : 1;
  const fatPrev = Math.round(sliceYear(meta.fat[year - 1] || meta.fat[year], month) * liveScale);
  const ticketVenda = qtd ? Math.round(fat / qtd) : 0;
  const ticketCliente = Math.round(ticketVenda * 1.18);
  const consultas = Math.round(qtd * 1.04);
  const vacinasAplicadas = Math.round(qtd * 0.56);
  const grupos = gruposNomes.map((nome, i) => {
    const valor = Math.round(fat * meta.share[i]);
    const media = Math.round(valor / grupoMediaDelta[i]);
    const vsAno = Math.round((grupoMediaDelta[i] - 1) * 100);
    return { nome, valor, media, vsAno };
  });
  const equipe = meta.equipe.map((p) => ({
    ...p,
    fat: Math.round(fat * p.peso),
    vendas: Math.max(1, Math.round(qtd * p.peso)),
    casa: meta.casa,
  }));
  const scale = month === "all" ? (year === 2026 ? 0.75 : 1) : year === 2026 && month === 8 ? 0.22 : 1;
  const vacinas = meta.vacinas.map((v) => ({
    nome: v.nome,
    total: Math.max(1, Math.round(v.t * scale)),
    aplicada: Math.max(0, Math.round(v.a * scale)),
    vencida: Math.max(0, Math.round((v.t - v.a) * 0.72 * scale)),
    programada: Math.max(0, Math.round((v.t - v.a) * 0.28 * scale)),
  }));
  vacinas.forEach((v) => {
    v.pendente = v.vencida + v.programada;
  });

  const origem = origemNomes.map((nome, i) => {
    const w = [0.42, 0.27, 0.14, 0.11, 0.06][i];
    return { nome, valor: Math.max(1, Math.round(qtd * 0.16 * w)) };
  });

  const hourly = [0, 0, 0, 0, 1, 4, 12, 28, 41, 36, 22, 18, 31, 38, 29, 24, 19, 11, 6, 3, 1, 0, 0, 0].map((n) =>
    Math.round(n * (meta.id === "matriz" ? 1 : 0.62) * (month === "all" ? 18 : 1))
  );

  const eletivas = Math.round(qtd * 0.07);
  const metaEletivas = Math.round(qtd * 0.085);

  const fatVenda = fat;
  const recebido = Math.round(fat * 0.89);
  const dreFat = fatVenda;
  const desc = Math.round(dreFat * 0.013);
  const liq = dreFat - desc;
  const cmv = Math.round(liq * 0.29);
  const bruto = liq - cmv;
  const pessoal = Math.round(liq * 0.34);
  const aluguel = Math.round(liq * 0.07);
  const util = Math.round(liq * 0.022);
  const mkt = Math.round(liq * 0.028);
  const lab = Math.round(liq * 0.053);
  const outras = Math.round(liq * 0.038);
  const resultado = bruto - pessoal - aluguel - util - mkt - lab - outras;

  return {
    id: meta.id,
    nome: meta.nome,
    casa: meta.casa,
    fat: recebido,
    fatVenda,
    fatPrev,
    delta: fatPrev ? Math.round(((fat - fatPrev) / fatPrev) * 1000) / 10 : 0,
    qtd,
    ticketVenda,
    ticketCliente,
    recebido,
    consultas,
    vacinasAplicadas,
    atendimentos: consultas + vacinasAplicadas,
    emergencia: Math.round(consultas * 0.47),
    internacao: Math.round(qtd * 0.08),
    examesQtd: Math.round(qtd * 0.62),
    eletivas,
    metaEletivas,
    eletivasPct: metaEletivas ? Math.round((eletivas / metaEletivas) * 100) : 0,
    novos: Math.round(qtd * 0.16),
    recorrentes: Math.round(qtd * 0.72),
    grupos,
    equipe: equipe.sort((a, b) => b.fat - a.fat),
    vacinas,
    origem,
    hourly,
    racas: [
      { nome: "SRD", n: Math.round(qtd * 0.38) },
      { nome: "Shih Tzu", n: Math.round(qtd * 0.12) },
      { nome: "Pinscher", n: Math.round(qtd * 0.08) },
      { nome: "Dachshund", n: Math.round(qtd * 0.07) },
      { nome: "Yorkshire", n: Math.round(qtd * 0.05) },
      { nome: "Outras", n: Math.round(qtd * 0.3) },
    ],
    genero: { fem: Math.round(qtd * 0.66), masc: Math.round(qtd * 0.34) },
    nps: { nota: meta.id === "matriz" ? 8.4 : 8.1, respostas: Math.round(qtd * 0.11) },
    dre: [
      { linha: "Receita bruta (vendas)", valor: dreFat },
      { linha: "Recebimentos", valor: recebido, destaque: true },
      { linha: "Deducoes / descontos", valor: -desc },
      { linha: "Receita liquida", valor: liq, destaque: true },
      { linha: "CMV / custo direto", valor: -cmv },
      { linha: "Lucro bruto", valor: bruto, destaque: true },
      { linha: "Pessoal", valor: -pessoal },
      { linha: "Aluguel e condominio", valor: -aluguel },
      { linha: "Energia, agua, internet", valor: -util },
      { linha: "Marketing", valor: -mkt },
      { linha: "Laboratorio / exames", valor: -lab },
      { linha: "Outras despesas", valor: -outras },
      { linha: "Resultado operacional", valor: resultado, destaque: true },
    ],
    monthlyFat: meta.fat[year],
    monthlyFatPrev: meta.fat[year - 1] || meta.fat[year],
    monthlyQtd: meta.vendas[year],
    dailyFat: Array.from({ length: month === "all" ? 0 : 11 }, (_, i) => ({
      d: i + 1,
      fat: Math.round((fat / 11) * (0.6 + ((i * 17) % 9) / 10)),
    })),
    compareYears: YEARS.map((y) => {
      const m = month === "all" ? lastCompleteMonth(y) : month;
      const scale = year === 2026 && month === 8 && y < 2026 ? 11 / 30 : 1;
      return {
        ano: y,
        fat: Math.round(sliceYear(meta.fat[y], m) * scale),
        qtd: Math.round(sliceYear(meta.vendas[y], m) * scale),
      };
    }),
  };
}

export function getView(unitId, year, month) {
  if (unitId !== "consolidado") return unitSlice(UNITS_META[unitId], year, month);
  const a = unitSlice(UNITS_META.matriz, year, month);
  const b = unitSlice(UNITS_META.filial, year, month);
  const fat = a.fat + b.fat;
  const qtd = a.qtd + b.qtd;
  const grupos = a.grupos.map((g, i) => ({
    nome: g.nome,
    valor: g.valor + b.grupos[i].valor,
    media: g.media + b.grupos[i].media,
    vsAno: Math.round((g.vsAno * g.valor + b.grupos[i].vsAno * b.grupos[i].valor) / (g.valor + b.grupos[i].valor || 1)),
    matriz: g.valor,
    filial: b.grupos[i].valor,
  }));
  return {
    id: "consolidado",
    nome: "As duas",
    casa: "Matriz + Sao Cristovao",
    fat,
    fatVenda: (a.fatVenda || 0) + (b.fatVenda || 0),
    fatPrev: a.fatPrev + b.fatPrev,
    delta: a.fatPrev + b.fatPrev ? Math.round(((fat - a.fatPrev - b.fatPrev) / (a.fatPrev + b.fatPrev)) * 1000) / 10 : 0,
    qtd,
    ticketVenda: qtd ? Math.round(((a.fatVenda || a.fat) + (b.fatVenda || b.fat)) / qtd) : 0,
    ticketCliente: Math.round(((a.ticketCliente * a.qtd + b.ticketCliente * b.qtd) / (qtd || 1))),
    recebido: a.recebido + b.recebido,
    consultas: a.consultas + b.consultas,
    vacinasAplicadas: a.vacinasAplicadas + b.vacinasAplicadas,
    atendimentos: a.atendimentos + b.atendimentos,
    emergencia: a.emergencia + b.emergencia,
    internacao: a.internacao + b.internacao,
    examesQtd: a.examesQtd + b.examesQtd,
    eletivas: a.eletivas + b.eletivas,
    metaEletivas: a.metaEletivas + b.metaEletivas,
    eletivasPct: a.metaEletivas + b.metaEletivas ? Math.round(((a.eletivas + b.eletivas) / (a.metaEletivas + b.metaEletivas)) * 100) : 0,
    novos: a.novos + b.novos,
    recorrentes: a.recorrentes + b.recorrentes,
    grupos,
    equipe: [...a.equipe, ...b.equipe].sort((x, y) => y.fat - x.fat),
    vacinas: a.vacinas.map((v, i) => ({
      nome: v.nome,
      total: v.total + b.vacinas[i].total,
      aplicada: v.aplicada + b.vacinas[i].aplicada,
      vencida: v.vencida + b.vacinas[i].vencida,
      programada: v.programada + b.vacinas[i].programada,
      pendente: v.pendente + b.vacinas[i].pendente,
    })),
    origem: a.origem.map((o, i) => ({ nome: o.nome, valor: o.valor + b.origem[i].valor })),
    hourly: a.hourly.map((n, i) => n + b.hourly[i]),
    racas: a.racas.map((r, i) => ({ nome: r.nome, n: r.n + b.racas[i].n })),
    genero: { fem: a.genero.fem + b.genero.fem, masc: a.genero.masc + b.genero.masc },
    nps: {
      nota: Math.round(((a.nps.nota * a.nps.respostas + b.nps.nota * b.nps.respostas) / (a.nps.respostas + b.nps.respostas)) * 10) / 10,
      respostas: a.nps.respostas + b.nps.respostas,
    },
    dre: a.dre.map((row, i) => ({
      ...row,
      valor: row.valor + b.dre[i].valor,
      matriz: row.valor,
      filial: b.dre[i].valor,
    })),
    monthlyFat: a.monthlyFat.map((n, i) => n + b.monthlyFat[i]),
    monthlyFatPrev: a.monthlyFatPrev.map((n, i) => n + b.monthlyFatPrev[i]),
    monthlyQtd: a.monthlyQtd.map((n, i) => n + b.monthlyQtd[i]),
    dailyFat: (a.dailyFat || []).map((d, i) => ({ d: d.d, fat: d.fat + (b.dailyFat?.[i]?.fat || 0) })),
    compareYears: a.compareYears.map((c, i) => ({
      ano: c.ano,
      fat: c.fat + b.compareYears[i].fat,
      qtd: c.qtd + b.compareYears[i].qtd,
    })),
  };
}
