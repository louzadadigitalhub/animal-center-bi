/* Análises do projeto de melhorias do BI (20/10/2026): o que o BI antigo
   (octaX) mostrava e este ainda não tinha, e os rankings dos veterinários.

   Tudo aqui é função pura sobre as linhas que o aggregate já leu (uma por
   item de venda). Conferido em 20/10/2026 contra o octaX:
   - Faturamento = soma do Líquido de todos os itens pela data da venda,
     as duas unidades. Set/2023 e set/2025 batem no centavo.
   - Cliente novo no mês = primeira compra da vida naquele mês. Set/2026:
     616 clientes e 165 novos aqui, 615 e 168 no octaX.

   Regras de atribuição (podem mudar com a diretoria):
   - Profissional = coluna "Funcionário" do item, a única que o SimplesVet
     exporta. É o mesmo critério do "Faturamento por Funcionário" do octaX.
   - Paciente = código do cliente + nome do animal (não há RG do paciente
     na exportação).
   - Consulta = paciente atendido num dia com item do grupo "Consultas"
     (Retorno fica fora). Vacina = ida do paciente no dia com item de
     "Vacinas", sem contar dose. Cirurgia, exame e internação entram para o
     veterinário da consulta mais recente do paciente, dentro de uma janela
     de dias depois dela.
   - Venda cancelada não chega: a exportação só traz Baixado, Aberto, Baixa
     parcial e Em atendimento. */

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

const r2 = (n) => Math.round(n * 100) / 100;
const daUnidade = (unit) => (r) => unit === "consolidado" || r.unit === unit;
const chaveCliente = (r) => r.codigo || r.cliente || "";
const chavePaciente = (r) => `${chaveCliente(r)}|${norm(r.animal)}`;
const diaAbs = (dt) => Math.round(Date.UTC(dt.y, dt.m - 1, dt.d) / 86400000);

/* Dia de corte: só os dias 1..dia de cada mês. Mês mais curto que o
   corte entra inteiro — o último dia que existe. */
export function noCorte(dt, dia) {
  return !dia || dt.d <= dia;
}

/* Mês 0-11 ou "all". */
function noPeriodo(dt, ano, mes, dia) {
  return dt.y === ano && (mes === "all" || dt.m === mes + 1) && noCorte(dt, dia);
}

/* ---------- Comparativo de faturamento entre anos ---------- */
export function comparativo(linhas, { unit = "consolidado", dia = null } = {}) {
  const fat = {};
  const vendas = {};
  const clientes = {};
  const doze = () => Array.from({ length: 12 }, () => new Set());
  const ok = daUnidade(unit);
  for (const r of linhas) {
    if (!ok(r) || !noCorte(r.dt, dia)) continue;
    const a = r.dt.y;
    const m = r.dt.m - 1;
    (fat[a] ??= Array(12).fill(0))[m] += r.valor;
    (vendas[a] ??= doze())[m].add(`${r.unit}|${r.venda}`);
    (clientes[a] ??= doze())[m].add(chaveCliente(r));
  }
  const anos = Object.keys(fat).map(Number).sort((a, b) => a - b);
  const porAno = {};
  for (const a of anos) {
    porAno[a] = {
      fat: fat[a].map(r2),
      vendas: vendas[a].map((s) => s.size),
      clientes: clientes[a].map((s) => s.size),
    };
  }
  return { unit, dia: dia || null, anos, porAno };
}

/* ---------- Curva de fluxo: vendas por hora, uma linha por mês ---------- */
export function fluxoHora(linhas, { unit = "consolidado", ano, dia = null }) {
  const vistas = new Set();
  const meses = {};
  const ok = daUnidade(unit);
  for (const r of linhas) {
    if (r.dt.y !== ano || !ok(r) || r.hora == null || !noCorte(r.dt, dia)) continue;
    const k = `${r.unit}|${r.venda}`;
    if (vistas.has(k)) continue;
    vistas.add(k);
    (meses[r.dt.m - 1] ??= Array(24).fill(0))[r.hora] += 1;
  }
  return {
    ano,
    meses: Object.entries(meses)
      .map(([m, valores]) => ({ m: Number(m), valores }))
      .sort((a, b) => a.m - b.m),
  };
}

/* ---------- Recorrência: clientes, novos e recorrentes por mês ---------- */
export function recorrenciaMensal(linhas, { unit = "consolidado", ano }) {
  const ok = daUnidade(unit);
  const primeira = new Map();
  for (const r of linhas) {
    if (!ok(r)) continue;
    const k = chaveCliente(r);
    if (!k) continue;
    const t = r.dt.y * 100 + r.dt.m;
    if (!primeira.has(k) || t < primeira.get(k)) primeira.set(k, t);
  }
  const meses = Array.from({ length: 12 }, () => ({ clientes: new Set(), fat: 0 }));
  for (const r of linhas) {
    if (r.dt.y !== ano || !ok(r)) continue;
    const x = meses[r.dt.m - 1];
    x.fat += r.valor;
    const k = chaveCliente(r);
    if (k) x.clientes.add(k);
  }
  let anoInicial = Infinity;
  for (const t of primeira.values()) anoInicial = Math.min(anoInicial, Math.floor(t / 100));
  return {
    ano,
    /* No primeiro ano do histórico todo cliente parece novo. */
    historicoDesde: Number.isFinite(anoInicial) ? anoInicial : null,
    meses: meses.map((x, m) => {
      let novos = 0;
      for (const k of x.clientes) if (primeira.get(k) === ano * 100 + m + 1) novos += 1;
      return { m, clientes: x.clientes.size, novos, recorrentes: x.clientes.size - novos, fat: r2(x.fat) };
    }),
  };
}

/* ---------- Faturamento por funcionário, grupo ou produto ----------
   Com a variação contra o mesmo recorte do ano anterior (mesmo mês e
   mesmo dia de corte). */
const DIMENSOES = {
  funcionario: (r) => r.user || "Sem nome",
  grupo: (r) => r.grupoSV || r.grupo || "Sem grupo",
  produto: (r) => r.produto || "Sem nome",
};

export function faturamentoPor(linhas, { unit = "consolidado", ano, mes = "all", dia = null, dim = "funcionario", limite = 40 }) {
  const chave = DIMENSOES[dim] || DIMENSOES.funcionario;
  const ok = daUnidade(unit);
  const atual = new Map();
  const antes = new Map();
  for (const r of linhas) {
    if (!ok(r)) continue;
    const alvo = noPeriodo(r.dt, ano, mes, dia) ? atual : noPeriodo(r.dt, ano - 1, mes, dia) ? antes : null;
    if (!alvo) continue;
    const k = chave(r);
    let x = alvo.get(k);
    if (!x) alvo.set(k, (x = { fat: 0, itens: 0, vendas: new Set() }));
    x.fat += r.valor;
    x.itens += 1;
    x.vendas.add(`${r.unit}|${r.venda}`);
  }
  const total = [...atual.values()].reduce((a, x) => a + x.fat, 0);
  const lista = [...atual]
    .map(([nome, x]) => {
      const ant = antes.get(nome)?.fat || 0;
      return {
        nome,
        fat: r2(x.fat),
        itens: x.itens,
        vendas: x.vendas.size,
        parte: total ? r2((x.fat / total) * 100) : 0,
        antes: r2(ant),
        varPct: ant > 0 ? r2(((x.fat - ant) / ant) * 100) : null,
      };
    })
    .sort((a, b) => b.fat - a.fat);
  return { dim, total: r2(total), quantos: lista.length, linhas: lista.slice(0, limite) };
}

/* ---------- Gráfico de conversão: consultas, cirurgias, exames e vacinas
   por mês ---------- */
export function conversaoMensal(linhas, { unit = "consolidado", ano }) {
  const ok = daUnidade(unit);
  const doze = () => Array.from({ length: 12 }, () => new Set());
  const consultas = doze();
  const cirurgias = doze();
  const vacinas = doze();
  const exames = Array(12).fill(0);
  for (const r of linhas) {
    if (r.dt.y !== ano || !ok(r)) continue;
    const g = norm(r.grupoSV);
    const m = r.dt.m - 1;
    const visita = `${diaAbs(r.dt)}|${chavePaciente(r)}`;
    if (g === "consultas") consultas[m].add(visita);
    else if (g === "cirurgias") cirurgias[m].add(visita);
    else if (g === "vacinas") vacinas[m].add(visita);
    else if (g === "exames") exames[m] += 1;
  }
  return {
    ano,
    consultas: consultas.map((s) => s.size),
    cirurgias: cirurgias.map((s) => s.size),
    exames,
    vacinas: vacinas.map((s) => s.size),
  };
}

/* ---------- Rankings dos veterinários e Coroa de Ouro ---------- */
export const RANKINGS = [
  { id: "ticket", nome: "Ticket médio por cliente", melhor: "maior", formato: "brl" },
  { id: "consultasPorCirurgia", nome: "Consultas por cirurgia", melhor: "menor", formato: "num" },
  { id: "examesPorConsulta", nome: "Exames por consulta", melhor: "maior", formato: "num" },
  { id: "internacao", nome: "Conversão em internação", melhor: "maior", formato: "pct" },
  { id: "atendimentos", nome: "Atendimentos", melhor: "maior", formato: "int" },
  { id: "nota", nome: "Nota do tutor", melhor: "maior", formato: "nota" },
];

export const CONFIG_PADRAO = {
  pesos: { ticket: 1, consultasPorCirurgia: 1, examesPorConsulta: 1, internacao: 1, atendimentos: 1, nota: 1 },
  /* Abaixo disso a pessoa não é tratada como veterinária no período: tira
     da lista quem lança uma consulta ou outra no caixa. */
  minConsultas: 10,
  minAvaliacoes: 5,
  janelaExames: 2,
  janelaInternacao: 3,
  janelaCirurgia: 30,
  excluir: [],
};

export function configCompleta(c = {}) {
  return {
    ...CONFIG_PADRAO,
    ...c,
    pesos: { ...CONFIG_PADRAO.pesos, ...(c.pesos || {}) },
    excluir: Array.isArray(c.excluir) ? c.excluir : [],
  };
}

/* O que vem da tela de configuração, já dentro dos limites. */
export function limparConfig(c = {}) {
  const inteiro = (v, min, max, padrao) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
  };
  const pesos = {};
  for (const rk of RANKINGS) {
    const n = Number(c.pesos?.[rk.id]);
    pesos[rk.id] = Number.isFinite(n) ? Math.min(10, Math.max(0, Math.round(n * 10) / 10)) : CONFIG_PADRAO.pesos[rk.id];
  }
  return {
    pesos,
    minConsultas: inteiro(c.minConsultas, 1, 500, CONFIG_PADRAO.minConsultas),
    minAvaliacoes: inteiro(c.minAvaliacoes, 1, 200, CONFIG_PADRAO.minAvaliacoes),
    janelaExames: inteiro(c.janelaExames, 0, 30, CONFIG_PADRAO.janelaExames),
    janelaInternacao: inteiro(c.janelaInternacao, 0, 30, CONFIG_PADRAO.janelaInternacao),
    janelaCirurgia: inteiro(c.janelaCirurgia, 0, 120, CONFIG_PADRAO.janelaCirurgia),
    excluir: (Array.isArray(c.excluir) ? c.excluir : [])
      .map((s) => String(s).slice(0, 80).trim())
      .filter(Boolean)
      .slice(0, 60),
  };
}

/* notas: { [funcionário]: { soma, n } } das avaliações do período. */
export function rankingVets(linhas, { unit = "consolidado", ano, mes = "all", dia = null, config = {}, notas = {} }) {
  const cfg = configCompleta(config);
  const ok = daUnidade(unit);
  const vets = new Map();
  const porPaciente = new Map();
  const vet = (nome, r) => {
    let v = vets.get(nome);
    if (!v) {
      v = { nome, casa: r.unit === "filial" ? "São Cristóvão" : "Animal Center", fat: 0, clientes: new Set(), consultas: [], vistas: new Set(), vacinas: new Set(), exames: 0 };
      vets.set(nome, v);
    }
    return v;
  };

  for (const r of linhas) {
    if (!ok(r) || !noPeriodo(r.dt, ano, mes, dia)) continue;
    const v = vet(r.user || "Sem nome", r);
    v.fat += r.valor;
    const c = chaveCliente(r);
    if (c) v.clientes.add(c);
    const g = norm(r.grupoSV);
    const t = diaAbs(r.dt);
    const pac = chavePaciente(r);
    if (g === "consultas") {
      const k = `${t}|${pac}`;
      if (!v.vistas.has(k)) {
        v.vistas.add(k);
        const consulta = { t, vet: v, cirurgia: false, internou: false };
        v.consultas.push(consulta);
        let lista = porPaciente.get(pac);
        if (!lista) porPaciente.set(pac, (lista = []));
        lista.push(consulta);
      }
    } else if (g === "vacinas") {
      v.vacinas.add(`${t}|${pac}`);
    }
  }
  for (const lista of porPaciente.values()) lista.sort((a, b) => a.t - b.t);

  /* O que veio depois da consulta vai para quem consultou. O item pode
     cair fora do período (consulta no dia 30, internação no dia 1). */
  const janela = { exames: cfg.janelaExames, cirurgias: cfg.janelaCirurgia, internamento: cfg.janelaInternacao };
  for (const r of linhas) {
    if (!ok(r)) continue;
    const g = norm(r.grupoSV);
    if (!(g in janela)) continue;
    const lista = porPaciente.get(chavePaciente(r));
    if (!lista) continue;
    const t = diaAbs(r.dt);
    let c = null;
    for (const x of lista) {
      if (x.t > t) break;
      c = x;
    }
    if (!c || t - c.t > janela[g]) continue;
    if (g === "exames") c.vet.exames += 1;
    else if (g === "cirurgias") c.cirurgia = true;
    else c.internou = true;
  }

  const fora = [];
  const dentro = [];
  for (const v of vets.values()) {
    const consultas = v.consultas.length;
    const cirurgias = v.consultas.filter((c) => c.cirurgia).length;
    const internacoes = v.consultas.filter((c) => c.internou).length;
    const nt = notas[v.nome];
    const linha = {
      nome: v.nome,
      casa: v.casa,
      fat: r2(v.fat),
      clientes: v.clientes.size,
      consultas,
      cirurgias,
      exames: v.exames,
      internacoes,
      vacinas: v.vacinas.size,
      avaliacoes: nt?.n || 0,
      ticket: v.clientes.size ? r2(v.fat / v.clientes.size) : null,
      consultasPorCirurgia: cirurgias ? r2(consultas / cirurgias) : null,
      examesPorConsulta: consultas ? r2(v.exames / consultas) : null,
      internacao: consultas ? r2((internacoes / consultas) * 100) : null,
      atendimentos: consultas + v.vacinas.size,
      nota: nt && nt.n >= cfg.minAvaliacoes ? r2(nt.soma / nt.n) : null,
      posicoes: {},
    };
    if (consultas >= cfg.minConsultas && !cfg.excluir.includes(v.nome)) dentro.push(linha);
    else if (consultas > 0) fora.push({ nome: v.nome, consultas, excluido: cfg.excluir.includes(v.nome) });
  }

  /* Posição em cada ranking, com empate dividindo a posição. Sem valor
     (sem cirurgia, sem avaliações suficientes) fica empatado no fim. */
  const rankings = {};
  for (const rk of RANKINGS) {
    const com = dentro.filter((v) => v[rk.id] != null);
    com.sort((a, b) => (rk.melhor === "menor" ? a[rk.id] - b[rk.id] : b[rk.id] - a[rk.id]));
    let pos = 0;
    let anterior = null;
    com.forEach((v, i) => {
      if (anterior === null || v[rk.id] !== anterior) pos = i + 1;
      anterior = v[rk.id];
      v.posicoes[rk.id] = pos;
    });
    for (const v of dentro) if (v[rk.id] == null) v.posicoes[rk.id] = com.length + 1;
    rankings[rk.id] = com.map((v) => v.nome);
  }

  /* Coroa de Ouro: soma das posições com peso. Menos pontos, melhor. */
  for (const v of dentro) {
    v.pontos = r2(RANKINGS.reduce((a, rk) => a + (Number(cfg.pesos[rk.id]) || 0) * v.posicoes[rk.id], 0));
  }
  dentro.sort((a, b) => a.pontos - b.pontos || (b.ticket || 0) - (a.ticket || 0));
  dentro.forEach((v, i) => {
    v.coroa = i + 1;
  });

  return {
    ano,
    mes,
    dia: dia || null,
    config: cfg,
    rankingsDef: RANKINGS,
    vets: dentro,
    rankings,
    fora: fora.sort((a, b) => b.consultas - a.consultas),
  };
}
