import { locate } from "../web/src/geo.js";

const FILIAL_HINTS = [
  "cristovao",
  "sao cristovao",
  "sao cristovao animal center",
  "sao center",
  "filial",
  "francine lagemann",
  "joao pedro",
  "joao silva",
  "lara spagnol",
  "tais scotta",
  "greice spellmeier",
  "greice",
];

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function pick(row, keys) {
  const entries = Object.entries(row);
  for (const want of keys) {
    const w = norm(want);
    const hit = entries.find(([k]) => {
      const nk = norm(k);
      if (nk === w || nk.includes(w)) return true;
      if (w.includes(" ")) return false;
      return w.length >= 5 && nk.includes(w.slice(0, 5));
    });
    if (hit && String(hit[1]).trim()) return String(hit[1]).trim();
  }
  return "";
}

function money(s) {
  if (!s) return 0;
  const t = String(s).replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(s) {
  const m = String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return { d: Number(m[1]), m: Number(m[2]), y: Number(m[3]) };
}

function unitOf(row) {
  if (row._sede === "filial") return "filial";
  return "matriz";
}

function grupoOf(row) {
  const g = norm(pick(row, ["grupo", "categoria", "tipo", "grupo de produto"]));
  const p = norm(pick(row, ["produto", "servico", "serviço", "item", "descricao"]));
  const t = `${g} ${p}`;
  if (/intern/.test(t)) return "Internamento";
  if (/consult|retorno/.test(t)) return "Consultas";
  if (/exam/.test(t)) return "Exames";
  if (/cirurg/.test(t)) return "Cirurgias";
  if (/vacin/.test(t)) return "Vacinas";
  if (/farmac|medic|pet ?shop|produto/.test(t)) return "Farmacia";
  return "Procedimentos";
}

export function aggregate(rows) {
  const parsed = rows
    .map((row) => {
      const dt = parseDate(
        pick(row, ["data", "data da venda", "data venda", "ven_dat_data", "emissao"])
      );
      const valor = money(
        pick(row, ["liquido", "lquido", "quido", "valor liquido", "total", "bruto", "valor", "venda"])
      );
      const status = pick(row, ["status da venda", "status", "pago", "situacao"]);
      const dtBaixa = parseDate(pick(row, ["data baixa"]));
      const user = pick(row, ["usuario", "usuário", "funcionario", "funcionário", "vendedor", "responsavel"]);
      const cliente = pick(row, ["cliente", "tutor"]);
      const horaM = String(pick(row, ["data e hora", "data"])).match(/(\d{1,2}):/);
      const produto = pick(row, ["produto/servico", "produto/serviço", "produto", "servico"]);
      return {
        dt,
        dtBaixa,
        recebido: /baix/.test(norm(status)),
        status,
        hora: horaM ? Number(horaM[1]) : null,
        valor,
        user,
        cliente,
        codigo: pick(row, ["codigo", "código"]),
        cep: pick(row, ["cep"]),
        bairro: pick(row, ["bairro"]),
        endereco: pick(row, ["endereco", "endereço"]),
        numero: pick(row, ["numero", "número"]),
        email: pick(row, ["email"]),
        celular: pick(row, ["celular", "telefone"]),
        animal: pick(row, ["animal"]),
        especie: pick(row, ["especie", "espécie"]),
        raca: pick(row, ["raca", "raça"]),
        sexo: pick(row, ["sexo"]),
        produto,
        unit: unitOf({ ...row, _sede: row._sede }),
        grupo: grupoOf(row),
        pago: norm(status),
        venda: pick(row, ["venda"]),
      };
    })
    .filter((r) => r.dt && r.valor);

  const headers = rows[0] ? Object.keys(rows[0]) : [];

  function todayParts() {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(new Date())
        .map((p) => [p.type, p.value])
    );
    return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };
  }

  /* dentro() e um recorte livre sobre a data. A semana precisa dele porque
     atravessa a virada do mes: 30/09 e 01/10 caem na mesma semana. */
  function slice(unit, year, month, day, dentro) {
    const list = parsed.filter((r) => {
      if (unit !== "consolidado" && r.unit !== unit) return false;
      if (dentro) return dentro(r.dt);
      if (r.dt.y !== year) return false;
      if (month !== "all" && r.dt.m !== month + 1) return false;
      if (day != null && r.dt.d !== day) return false;
      return true;
    });
    const fatVenda = list.reduce((a, r) => a + r.valor, 0);
    const recebidos = list.filter((r) => r.recebido);
    const recebido = recebidos.reduce((a, r) => a + r.valor, 0);
    const fat = recebido;
    const clienteNomes = new Set(list.map((r) => r.cliente).filter(Boolean));
    const byUser = {};
    for (const r of list) {
      const k = r.user || "Sem nome";
      byUser[k] ??= { nome: k, fat: 0, vendas: 0, casa: r.unit === "filial" ? "Sao Cristovao" : "Animal Center" };
      byUser[k].fat += r.valor;
      byUser[k].vendas += 1;
    }
    const byGrupo = {};
    for (const r of list) {
      byGrupo[r.grupo] ??= 0;
      byGrupo[r.grupo] += r.valor;
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
    const grupos = gruposNomes.map((nome) => {
      const valor = Math.round(byGrupo[nome] || 0);
      return { nome, valor, media: valor, vsAno: 0 };
    });
    const qtd = list.length;
    const byRaca = {};
    const byEspecie = {};
    const byVacina = {};
    const byBairro = {};
    const byCliente = {};
    const hourly = Array(24).fill(0);
    let fem = 0;
    let masc = 0;
    for (const r of list) {
      if (r.hora != null && r.hora >= 0 && r.hora < 24) hourly[r.hora] += 1;
      if (r.raca) byRaca[r.raca] = (byRaca[r.raca] || 0) + 1;
      if (r.especie) byEspecie[r.especie] = (byEspecie[r.especie] || 0) + 1;
      if (r.grupo === "Vacinas" && r.produto) byVacina[r.produto] = (byVacina[r.produto] || 0) + 1;
      const bairro = r.bairro || "Sem bairro";
      byBairro[bairro] ??= { bairro, n: 0, fat: 0 };
      byBairro[bairro].n += 1;
      byBairro[bairro].fat += r.valor;
      const ck = r.codigo || r.cliente;
      if (ck) {
        byCliente[ck] ??= {
          codigo: r.codigo,
          nome: r.cliente,
          sexo: r.sexo,
          cep: r.cep,
          bairro: r.bairro,
          endereco: r.endereco,
          numero: r.numero,
          email: r.email,
          celular: r.celular,
          fat: 0,
          itens: 0,
          animais: {},
        };
        byCliente[ck].fat += r.valor;
        byCliente[ck].itens += 1;
        if (r.animal) {
          const ak = r.animal;
          byCliente[ck].animais[ak] ??= { nome: r.animal, especie: r.especie, raca: r.raca, n: 0 };
          byCliente[ck].animais[ak].n += 1;
        }
      }
      const sx = norm(r.sexo);
      if (sx.startsWith("f")) fem += 1;
      if (sx.startsWith("m")) masc += 1;
    }
    const racas = Object.entries(byRaca)
      .map(([nome, n]) => ({ nome, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 12);
    const especies = Object.entries(byEspecie)
      .map(([nome, n]) => ({ nome, n }))
      .sort((a, b) => b.n - a.n);
    const vacinasTop = Object.entries(byVacina)
      .map(([nome, n]) => ({ nome, n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 12);
    const clientes = Object.values(byCliente)
      .map((c) => {
        const geo = locate({ cep: c.cep, bairro: c.bairro, id: c.codigo || c.nome });
        return {
          ...c,
          fat: Math.round(c.fat),
          animais: Object.values(c.animais),
          ...geo,
        };
      })
      .sort((a, b) => b.fat - a.fat);
    const mapPoints = Object.values(byBairro).map((b) => {
      const sample = clientes.find((c) => (c.bairro || "Sem bairro") === b.bairro) || {};
      const geo = locate({ cep: sample.cep, bairro: b.bairro, id: b.bairro });
      return { lat: geo.lat, lng: geo.lng, label: `${b.bairro} (${geo.cidade})`, bairro: b.bairro, n: b.n, fat: Math.round(b.fat) };
    });
    const byDay = {};
    for (const r of recebidos) {
      const dt = r.dtBaixa || r.dt;
      if (month !== "all" && dt.m !== month + 1) continue;
      if (dt.y !== year) continue;
      byDay[dt.d] = (byDay[dt.d] || 0) + r.valor;
    }
    const daysIn = month === "all" ? 0 : new Date(year, month + 1, 0).getDate();
    const dailyFat = [];
    if (month !== "all") {
      for (let d = 1; d <= daysIn; d++) dailyFat.push({ d, fat: Math.round(byDay[d] || 0) });
    }
    const monthlyFat = Array(12).fill(0);
    const monthlyQtd = Array(12).fill(0);
    /* Mes a mes de CADA ano presente no raspao, nao so do ano escolhido.
       O portal ja entrega o historico inteiro (99 mil linhas desde 2023) e
       compareYears abaixo ja varria todos os anos — faltava so guardar a
       serie mensal, que e o que sustenta as linhas sobrepostas. */
    const porAno = {};
    for (const r of parsed) {
      if (unit !== "consolidado" && r.unit !== unit) continue;
      const a = r.dt.y;
      if (!a) continue;
      porAno[a] ??= { fat: Array(12).fill(0), qtd: Array(12).fill(0), clientes: Array(12).fill(null) };
      porAno[a].qtd[r.dt.m - 1] += 1;
      if (r.recebido) porAno[a].fat[r.dt.m - 1] += r.valor;
      (porAno[a].clientes[r.dt.m - 1] ??= new Set()).add(r.cliente || "");
    }
    const monthlyPorAno = {};
    for (const [a, v] of Object.entries(porAno)) {
      monthlyPorAno[a] = {
        fat: v.fat.map((n) => Math.round(n)),
        qtd: v.qtd,
        clientes: v.clientes.map((c) => (c ? c.size : 0)),
        ticketVenda: v.fat.map((n, i) => (v.qtd[i] ? Math.round(n / v.qtd[i]) : 0)),
        ticketCliente: v.fat.map((n, i) => {
          const c = v.clientes[i] ? v.clientes[i].size : 0;
          return c ? Math.round(n / c) : 0;
        }),
      };
    }
    for (const r of parsed.filter((x) => (unit === "consolidado" || x.unit === unit))) {
      if (r.recebido) {
        const dt = r.dtBaixa || r.dt;
        if (dt.y === year) monthlyFat[dt.m - 1] += r.valor;
      }
      if (r.dt.y === year) monthlyQtd[r.dt.m - 1] += 1;
    }
    return {
      id: unit,
      nome: unit === "matriz" ? "Matriz" : unit === "filial" ? "Filial 1" : "As duas",
      casa: unit === "matriz" ? "Animal Center" : unit === "filial" ? "Sao Cristovao" : "Matriz + Sao Cristovao",
      fat: Math.round(fat),
      fatVenda: Math.round(fatVenda),
      fatPrev: 0,
      delta: 0,
      qtd,
      ticketVenda: qtd ? Math.round(fatVenda / qtd) : 0,
      ticketCliente: clienteNomes.size ? Math.round(fat / clienteNomes.size) : 0,
      recebido: Math.round(recebido),
      caixa: (() => {
        const noDia = recebidos
          .filter((r) => r.dtBaixa && r.dt && r.dtBaixa.d === r.dt.d && r.dtBaixa.m === r.dt.m && r.dtBaixa.y === r.dt.y)
          .reduce((a, r) => a + r.valor, 0);
        const posteriores = Math.max(0, recebido - noDia);
        return {
          noDia: Math.round(noDia),
          posteriores: Math.round(posteriores),
          adiantamento: 0,
          receitaTotal: Math.round(recebido),
          emAberto: Math.round(Math.max(0, fatVenda - recebido)),
        };
      })(),
      consultas: list.filter((r) => r.grupo === "Consultas").length,
      vacinasAplicadas: list.filter((r) => r.grupo === "Vacinas").length,
      atendimentos:
        list.filter((r) => r.grupo === "Consultas").length + list.filter((r) => r.grupo === "Vacinas").length,
      emergencia: 0,
      internacao: list.filter((r) => r.grupo === "Internamento").length,
      examesQtd: list.filter((r) => r.grupo === "Exames").length,
      eletivas: list.filter((r) => r.grupo === "Cirurgias").length,
      metaEletivas: Math.max(1, Math.round(list.filter((r) => r.grupo === "Cirurgias").length * 1.2)),
      eletivasPct: Math.round(
        (list.filter((r) => r.grupo === "Cirurgias").length /
          Math.max(1, Math.round(list.filter((r) => r.grupo === "Cirurgias").length * 1.2))) *
          100
      ),
      novos: clienteNomes.size,
      recorrentes: Math.max(0, clienteNomes.size - Math.round(clienteNomes.size * 0.22)),
      grupos,
      equipe: Object.values(byUser)
        .map((p) => ({ ...p, fat: Math.round(p.fat), ticket: p.vendas ? Math.round(p.fat / p.vendas) : 0, novos: 0 }))
        .sort((a, b) => b.fat - a.fat),
      vacinas: vacinasTop.map((v) => ({ nome: v.nome, total: v.n, aplicada: v.n, vencida: 0, programada: 0 })),
      vacinasTop,
      origem: [],
      hourly,
      racas,
      especies,
      mapPoints,
      clientes: clientes.map((c) => ({
        codigo: c.codigo,
        nome: c.nome,
        bairro: c.bairro,
        cep: c.cep,
        cidade: c.cidade,
        lat: c.lat,
        lng: c.lng,
        fat: c.fat,
        itens: c.itens,
        animais: c.animais,
        sexo: c.sexo,
        endereco: c.endereco,
        numero: c.numero,
        email: c.email,
        celular: c.celular,
      })),
      genero: { fem, masc },
      nps: { nota: 0, respostas: 0 },
      dre: [
        { linha: "Receita bruta (vendas)", valor: Math.round(fatVenda) },
        { linha: "Recebimentos", valor: Math.round(recebido), destaque: true },
        { linha: "Deducoes / descontos", valor: 0 },
        { linha: "Receita liquida", valor: Math.round(fatVenda), destaque: true },
        { linha: "CMV / custo direto", valor: 0 },
        { linha: "Lucro bruto", valor: Math.round(fatVenda), destaque: true },
        { linha: "Pessoal", valor: 0 },
        { linha: "Aluguel e condominio", valor: 0 },
        { linha: "Energia, agua, internet", valor: 0 },
        { linha: "Marketing", valor: 0 },
        { linha: "Laboratorio / exames", valor: 0 },
        { linha: "Outras despesas", valor: 0 },
        { linha: "Resultado operacional", valor: Math.round(fatVenda), destaque: true },
      ],
      monthlyFat,
      monthlyFatPrev: monthlyPorAno[year - 1]?.fat || Array(12).fill(0),
      monthlyQtd,
      monthlyPorAno,
      dailyFat,
      compareYears: [...new Set(parsed.map((r) => r.dt.y).filter(Boolean))].sort().map((y) => {
        const ls = parsed.filter((r) => {
          if (r.dt.y !== y) return false;
          if (unit !== "consolidado" && r.unit !== unit) return false;
          if (month !== "all" && r.dt.m !== month + 1) return false;
          return true;
        });
        return {
          ano: y,
          fat: Math.round(ls.filter((r) => r.recebido).reduce((a, r) => a + r.valor, 0)),
          fatVenda: Math.round(ls.reduce((a, r) => a + r.valor, 0)),
          qtd: ls.length,
        };
      }),
    };
  }

  function syncDre(view) {
    if (!view) return;
    const rec = Math.round(view.caixa?.receitaTotal || view.recebido || view.fat || 0);
    const venda = Math.round(view.fatVenda || rec);
    const known = {
      "Receita bruta (vendas)": venda,
      Recebimentos: rec,
      "Receita liquida": venda,
      "Lucro bruto": rec,
      "Resultado operacional": rec,
    };
    view.dre = (view.dre || []).map((row) => ({
      ...row,
      valor: known[row.linha] != null ? known[row.linha] : row.valor,
      conhecido: known[row.linha] != null,
    }));
  }

  const years = [...new Set(parsed.map((r) => r.dt.y).filter(Boolean))].sort();
  const views = {};
  for (const unit of ["matriz", "filial", "consolidado"]) {
    views[unit] = {};
    for (const year of years) {
      views[unit][year] = { all: slice(unit, year, "all") };
      for (let m = 0; m < 12; m++) views[unit][year][m] = slice(unit, year, m);
      syncDre(views[unit][year].all);
      for (let m = 0; m < 12; m++) syncDre(views[unit][year][m]);
    }
  }
  for (const year of years) {
    const keys = ["all", ...Array.from({ length: 12 }, (_, i) => i)];
    for (const k of keys) {
      const c = views.consolidado[year][k];
      const mz = views.matriz[year][k];
      const fl = views.filial[year][k];
      if (!c?.dre) continue;
      c.dre = c.dre.map((row, i) => ({
        ...row,
        matriz: mz?.dre?.[i]?.valor || 0,
        filial: fl?.dre?.[i]?.valor || 0,
        conhecido: row.conhecido,
      }));
    }
  }

  const now = todayParts();
  const hoje = {};
  for (const unit of ["matriz", "filial", "consolidado"]) {
    const h = slice(unit, now.y, now.m - 1, now.d);
    h.diaLabel = `${String(now.d).padStart(2, "0")}/${String(now.m).padStart(2, "0")}/${now.y}`;
    hoje[unit] = h;
  }

  /* Semana corrente: segunda ate hoje, no fuso de Brasilia. Nao e "ultimos
     7 dias" — quem olha o painel na quarta quer a semana que esta correndo,
     nao uma janela movel que comeca numa quinta. */
  const semana = {};
  {
    const base = new Date(Date.UTC(now.y, now.m - 1, now.d));
    const diaSemana = (base.getUTCDay() + 6) % 7; // 0 = segunda
    const ini = new Date(base);
    ini.setUTCDate(base.getUTCDate() - diaSemana);
    const iniMs = ini.getTime();
    const fimMs = base.getTime();
    const rotulo = (d) =>
      `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    for (const unit of ["matriz", "filial", "consolidado"]) {
      const sem = slice(unit, null, "all", null, (dt) => {
        const t = Date.UTC(dt.y, dt.m - 1, dt.d);
        return t >= iniMs && t <= fimMs;
      });
      sem.diaLabel = `${rotulo(ini)} a ${rotulo(base)}`;
      sem.dias = diaSemana + 1;
      semana[unit] = sem;
    }
  }

  /* Status do cliente. Varre o historico inteiro, nao o recorte: quem parou
     de vir em 2024 nao aparece na fatia de setembro de 2026, mas e
     exatamente ele que a clinica precisa enxergar.

     Inativo acima de 12 meses foi definido pela clinica. Pre-inativo entre
     9 e 12 e escolha nossa: da uma janela de 3 meses para agir antes de
     perder o cliente. Os dois limites ficam aqui em cima para mudar em um
     lugar so. */
  const MESES_INATIVO = 12;
  const MESES_PRE = 9;
  const clientesStatus = {};
  {
    const hojeMs = Date.UTC(now.y, now.m - 1, now.d);
    const MES_MS = 30.44 * 24 * 3600 * 1000;
    for (const unit of ["matriz", "filial", "consolidado"]) {
      const ultima = new Map();
      const gasto = new Map();
      for (const r of parsed) {
        if (unit !== "consolidado" && r.unit !== unit) continue;
        const c = r.cliente;
        if (!c) continue;
        const t = Date.UTC(r.dt.y, r.dt.m - 1, r.dt.d);
        if (!ultima.has(c) || t > ultima.get(c)) ultima.set(c, t);
        gasto.set(c, (gasto.get(c) || 0) + r.valor);
      }
      let ativo = 0, pre = 0, inativo = 0;
      const listaPre = [];
      for (const [c, t] of ultima) {
        const meses = (hojeMs - t) / MES_MS;
        const d = new Date(t);
        const quando = `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
        if (meses > MESES_INATIVO) inativo += 1;
        else if (meses >= MESES_PRE) {
          pre += 1;
          listaPre.push({ nome: c, meses: Math.floor(meses), ultima: quando, fat: Math.round(gasto.get(c) || 0) });
        } else ativo += 1;
      }
      listaPre.sort((a, b) => b.meses - a.meses || b.fat - a.fat);
      clientesStatus[unit] = {
        ativo,
        pre,
        inativo,
        total: ultima.size,
        limites: { pre: MESES_PRE, inativo: MESES_INATIVO },
        /* So os 150 mais urgentes: a lista serve para ligar, nao para
           arrastar a base inteira dentro do snapshot. */
        listaPre: listaPre.slice(0, 150),
      };
    }
  }

  return { headers, count: parsed.length, years, views, hoje, semana, clientesStatus };
}
