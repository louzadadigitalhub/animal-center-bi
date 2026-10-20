import { useEffect, useState } from "react";
import { apiFetch } from "./supa.js";
import { brl, brlc, hojeBR } from "./data";

/* Peças do projeto de melhorias (20/10/2026): o que o BI antigo (octaX)
   mostrava e este ainda não tinha. Cada cartão pede o próprio dado a
   /api/analise/<tipo>, que exige a aba onde ele aparece. */

export const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/* Uma cor bem diferente por série: anos e meses precisam se distinguir. */
export const CORES = ["#7a8fb5", "#4f8ff7", "#2ad4c8", "#3ec8f0", "#f5b84a", "#e56b9f", "#9d7bf2", "#8bd17c"];

const curto = (v) => {
  const n = Math.round(Number(v) || 0);
  if (Math.abs(n) >= 10000) return `${Math.round(n / 1000).toLocaleString("pt-BR")} mil`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return n.toLocaleString("pt-BR");
};
export const pct = (v, casas = 1) =>
  v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
const variacao = (atual, antes) => (antes ? ((atual - antes) / antes) * 100 : null);
const inteiro = (n) => Number(n || 0).toLocaleString("pt-BR");

export function useApi(url) {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  useEffect(() => {
    if (!url) return undefined;
    let vivo = true;
    setCarregando(true);
    apiFetch(url)
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        if (!j.ok) throw new Error(j.error || "não deu");
        setD(j);
        setErro("");
      })
      .catch((e) => vivo && setErro(e.message))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [url]);
  return { d, erro, carregando };
}

export function Aguarde({ titulo, erro, largura = "span-12" }) {
  return (
    <section className={`card ${largura}`}>
      <header>
        <h2>{titulo}</h2>
        <p>{erro ? `Não carregou: ${erro}` : "Montando…"}</p>
      </header>
    </section>
  );
}

/* Seletor de dia de corte: "mês inteiro" ou até o dia N de cada mês. */
export function DiaCorte({ dia, onChange }) {
  const hoje = hojeBR().getDate();
  return (
    <label className="an-campo">
      Dia de corte
      <select value={dia} onChange={(e) => onChange(e.target.value)} aria-label="Dia de corte">
        <option value="">mês inteiro</option>
        {Array.from({ length: 31 }, (_, i) => (
          <option key={i + 1} value={String(i + 1)}>
            até o dia {i + 1}
            {i + 1 === hoje ? " (hoje)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

/* Linhas com o valor de cada série ao passar o mouse, como a dica do
   octaX. valores null não desenham (mês que ainda não chegou). */
export function Linhas({ series, rotulos, fmt = curto, h = 260, rotuloFoco }) {
  const [foco, setFoco] = useState(null);
  const w = 760;
  const padL = 54;
  const padR = 14;
  const top = 14;
  const base = h - 26;
  const n = rotulos.length;
  const valores = series.flatMap((s) => s.valores.filter((v) => v != null));
  const max = Math.max(1, ...valores);
  const x = (i) => padL + (n <= 1 ? 0 : (i * (w - padL - padR)) / (n - 1));
  const y = (v) => base - (v / max) * (base - top);
  const passo = n > 1 ? (w - padL - padR) / (n - 1) : w;
  const caixaW = 190;
  const caixaH = 22 + 15 * series.length;
  const fx = foco == null ? 0 : x(foco) + 12 + caixaW > w ? x(foco) - 12 - caixaW : x(foco) + 12;
  return (
    <div className="an-grafico">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Gráfico de linhas" onMouseLeave={() => setFoco(null)}>
        {[0, 1, 2, 3, 4].map((k) => {
          const v = (max / 4) * k;
          return (
            <g key={k}>
              <line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} stroke="var(--line)" />
              <text x={padL - 6} y={y(v) + 3} textAnchor="end" fontSize="10" fill="var(--text-3)">
                {k === 0 ? "0" : curto(v)}
              </text>
            </g>
          );
        })}
        {rotulos.map((r, i) => (
          <text key={i} x={x(i)} y={h - 8} textAnchor="middle" fontSize="10" fill="var(--text-3)">
            {r}
          </text>
        ))}
        {series.map((s) => {
          const partes = [];
          let atual = [];
          s.valores.forEach((v, i) => {
            if (v == null) {
              if (atual.length) partes.push(atual);
              atual = [];
            } else atual.push([x(i), y(v)]);
          });
          if (atual.length) partes.push(atual);
          return (
            <g key={s.nome}>
              {partes.map((p, k) =>
                p.length === 1 ? (
                  <circle key={k} cx={p[0][0]} cy={p[0][1]} r="3" fill={s.cor} />
                ) : (
                  <polyline
                    key={k}
                    points={p.map((q) => q.join(",")).join(" ")}
                    fill="none"
                    stroke={s.cor}
                    strokeWidth={s.forte ? 2.8 : 1.8}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )
              )}
            </g>
          );
        })}
        {foco != null ? (
          <g>
            <line x1={x(foco)} x2={x(foco)} y1={top} y2={base} stroke="var(--text-3)" strokeDasharray="3 3" />
            {series.map((s) =>
              s.valores[foco] == null ? null : <circle key={s.nome} cx={x(foco)} cy={y(s.valores[foco])} r="4" fill="var(--surface-1)" stroke={s.cor} strokeWidth="2" />
            )}
            <rect x={fx} y={top} width={caixaW} height={caixaH} rx="6" fill="var(--surface-2)" stroke="var(--line)" />
            <text x={fx + 10} y={top + 15} fontSize="11" fontWeight="700" fill="var(--text)">
              {rotuloFoco ? rotuloFoco(foco) : rotulos[foco]}
            </text>
            {series.map((s, k) => (
              <g key={s.nome}>
                <rect x={fx + 10} y={top + 24 + k * 15} width="8" height="8" rx="2" fill={s.cor} />
                <text x={fx + 24} y={top + 32 + k * 15} fontSize="11" fill="var(--text-2)">
                  {s.nome}: {s.valores[foco] == null ? "—" : fmt(s.valores[foco])}
                </text>
              </g>
            ))}
          </g>
        ) : null}
        {rotulos.map((_, i) => (
          <rect key={i} x={x(i) - passo / 2} y={0} width={passo} height={base} fill="transparent" onMouseEnter={() => setFoco(i)} />
        ))}
      </svg>
      <ul className="an-legenda">
        {series.map((s) => (
          <li key={s.nome}>
            <i style={{ background: s.cor }} />
            {s.nome}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Aba Comparativo ---------- */
const MEDIDAS = [
  ["fat", "Faturamento"],
  ["vendas", "Vendas"],
  ["clientes", "Clientes"],
  ["ticket", "Ticket por cliente"],
];

export function Comparativo({ unit }) {
  const hoje = hojeBR();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth();
  const [dia, setDia] = useState("");
  const [medida, setMedida] = useState("fat");
  const [ocultos, setOcultos] = useState(() => new Set());
  const { d, erro } = useApi(`/api/analise/comparativo?unit=${unit}${dia ? `&dia=${dia}` : ""}`);
  if (!d) {
    return (
      <div className="bento">
        <Aguarde titulo="Comparativo de faturamento" erro={erro} />
      </div>
    );
  }

  const futuro = (a, m) => a > anoAtual || (a === anoAtual && m > mesAtual);
  const valor = (a, m) => {
    if (futuro(a, m)) return null;
    const p = d.porAno[a];
    if (!p) return null;
    if (medida === "ticket") return p.clientes[m] ? p.fat[m] / p.clientes[m] : null;
    return p[medida][m];
  };
  const fmt = medida === "fat" || medida === "ticket" ? brlc : inteiro;
  /* Soma dos meses 0..ate. Clientes não somam (o mesmo cliente volta). */
  const somaAte = (a, ate) => {
    const p = d.porAno[a];
    if (!p) return null;
    if (medida === "ticket") {
      const f = p.fat.slice(0, ate + 1).reduce((x, y) => x + y, 0);
      const c = p.clientes.slice(0, ate + 1).reduce((x, y) => x + y, 0);
      return c ? f / c : null;
    }
    return p[medida].slice(0, ate + 1).reduce((x, y) => x + y, 0);
  };
  const visiveis = d.anos.filter((a) => !ocultos.has(a));
  const alternar = (a) =>
    setOcultos((s) => {
      const n = new Set(s);
      if (n.has(a)) n.delete(a);
      else n.add(a);
      return n;
    });
  const corDe = (a) => CORES[d.anos.indexOf(a) % CORES.length];
  const celulas = (a, v, vr) => [
    <td key={`${a}v`} className="num">
      {v == null ? "—" : fmt(v)}
    </td>,
    <td key={`${a}p`} className={`num ${vr > 0 ? "up" : vr < 0 ? "down" : ""}`}>
      {pct(vr)}
    </td>,
  ];

  return (
    <div className="bento">
      <section className="card span-12">
        <header>
          <h2>Comparativo entre anos</h2>
          <p>
            Cada linha é um ano. Faturamento é a soma das vendas pela data da venda, como no BI antigo. Com dia de corte, todos os meses de
            todos os anos param no mesmo dia; mês mais curto entra inteiro.
          </p>
        </header>
        <div className="an-filtro">
          <div className="an-abas" role="tablist" aria-label="Medida">
            {MEDIDAS.map(([id, nome]) => (
              <button key={id} type="button" role="tab" aria-selected={medida === id} className={medida === id ? "on" : ""} onClick={() => setMedida(id)}>
                {nome}
              </button>
            ))}
          </div>
          <DiaCorte dia={dia} onChange={setDia} />
          <div className="an-abas" aria-label="Anos">
            {d.anos.map((a) => (
              <button key={a} type="button" className={ocultos.has(a) ? "" : "on"} onClick={() => alternar(a)} aria-pressed={!ocultos.has(a)}>
                <i className="an-cor" style={{ background: corDe(a) }} />
                {a}
              </button>
            ))}
          </div>
        </div>
        <Linhas
          series={visiveis.map((a) => ({ nome: String(a), cor: corDe(a), forte: a === anoAtual, valores: MESES.map((_, m) => valor(a, m)) }))}
          rotulos={MESES}
          fmt={fmt}
          rotuloFoco={(i) => MESES_LONGOS[i]}
        />
      </section>

      <section className="card span-12">
        <header>
          <h2>Mês a mês</h2>
          <p>Ao lado de cada ano, a variação contra o mesmo mês do ano anterior{dia ? `, até o dia ${dia}` : ""}.</p>
        </header>
        <div className="table-wrap">
          <table className="an-tabela">
            <thead>
              <tr>
                <th>Mês</th>
                {visiveis.map((a) => (
                  <th key={a} colSpan={2} className="num">
                    {a}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MESES.map((nome, m) => (
                <tr key={nome} className={m === mesAtual ? "an-agora" : ""}>
                  <td>{MESES_LONGOS[m]}</td>
                  {visiveis.map((a) => {
                    const v = valor(a, m);
                    const ant = valor(a - 1, m);
                    return celulas(a, v, v != null && ant != null ? variacao(v, ant) : null);
                  })}
                </tr>
              ))}
              {medida !== "clientes" ? (
                <tr className="an-total">
                  <td>Até {MESES[mesAtual]}</td>
                  {visiveis.map((a) => {
                    const v = somaAte(a, mesAtual);
                    const ant = somaAte(a - 1, mesAtual);
                    return celulas(a, v, v != null && ant != null ? variacao(v, ant) : null);
                  })}
                </tr>
              ) : null}
              {medida !== "clientes" ? (
                <tr className="an-total">
                  <td>Ano inteiro</td>
                  {visiveis.map((a) => {
                    const v = a === anoAtual ? null : somaAte(a, 11);
                    const ant = somaAte(a - 1, 11);
                    return celulas(a, v, v != null && ant != null ? variacao(v, ant) : null);
                  })}
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ---------- Vendas: faturamento por funcionário, grupo e produto ---------- */
const DIMS = [
  ["funcionario", "Funcionário"],
  ["grupo", "Grupo"],
  ["produto", "Produto/serviço"],
];

export function FaturamentoPor({ unit, year, month }) {
  const [dim, setDim] = useState("funcionario");
  const [dia, setDia] = useState("");
  const mes = month === "all" ? "all" : Number(month);
  const { d, erro } = useApi(`/api/analise/por?unit=${unit}&ano=${year}&mes=${mes}&dim=${dim}${dia ? `&dia=${dia}` : ""}`);
  const periodo = mes === "all" ? String(year) : `${MESES[mes]}/${year}`;
  const rotulo = DIMS.find((x) => x[0] === dim)[1];
  return (
    <section className="card span-12">
      <header>
        <h2>Faturamento por {rotulo.toLowerCase()}</h2>
        <p>
          {periodo}
          {dia ? `, até o dia ${dia}` : ""}. Variação contra o mesmo recorte do ano anterior.
        </p>
      </header>
      <div className="an-filtro">
        <div className="an-abas" role="tablist" aria-label="Agrupar por">
          {DIMS.map(([id, nome]) => (
            <button key={id} type="button" role="tab" aria-selected={dim === id} className={dim === id ? "on" : ""} onClick={() => setDim(id)}>
              {nome}
            </button>
          ))}
        </div>
        <DiaCorte dia={dia} onChange={setDia} />
      </div>
      {!d ? (
        <p className="hint">{erro ? `Não carregou: ${erro}` : "Montando…"}</p>
      ) : (
        <div className="table-wrap">
          <table className="an-tabela">
            <thead>
              <tr>
                <th>{rotulo}</th>
                <th className="num">Faturamento</th>
                <th className="num">% do total</th>
                <th className="num">Itens</th>
                <th className="num">Vendas</th>
                <th className="num">Ano anterior</th>
                <th className="num">Variação</th>
              </tr>
            </thead>
            <tbody>
              {d.linhas.map((l) => (
                <tr key={l.nome}>
                  <td>{l.nome}</td>
                  <td className="num">{brlc(l.fat)}</td>
                  <td className="num">{l.parte.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</td>
                  <td className="num">{inteiro(l.itens)}</td>
                  <td className="num">{inteiro(l.vendas)}</td>
                  <td className="num">{l.antes ? brlc(l.antes) : "—"}</td>
                  <td className={`num ${l.varPct > 0 ? "up" : l.varPct < 0 ? "down" : ""}`}>{pct(l.varPct)}</td>
                </tr>
              ))}
              <tr className="an-total">
                <td>Total ({inteiro(d.quantos)})</td>
                <td className="num">{brlc(d.total)}</td>
                <td colSpan={5} />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const cortaFuturo = (year, vals) => {
  const hoje = hojeBR();
  return vals.map((v, m) => (year > hoje.getFullYear() || (year === hoje.getFullYear() && m > hoje.getMonth()) ? null : v));
};

/* ---------- Vendas: gráfico de conversão ---------- */
export function GraficoConversao({ unit, year }) {
  const { d, erro } = useApi(`/api/analise/conversao?unit=${unit}&ano=${year}`);
  if (!d) return <Aguarde titulo="Gráfico de conversão" erro={erro} />;
  return (
    <section className="card span-12">
      <header>
        <h2>Gráfico de conversão · {year}</h2>
        <p>Consultas, cirurgias e vacinas contam a ida do paciente no dia (sem contar dose); exames contam cada exame pedido.</p>
      </header>
      <Linhas
        series={[
          { nome: "Consultas", cor: CORES[3], forte: true, valores: cortaFuturo(year, d.consultas) },
          { nome: "Cirurgias", cor: CORES[5], valores: cortaFuturo(year, d.cirurgias) },
          { nome: "Exames", cor: CORES[4], valores: cortaFuturo(year, d.exames) },
          { nome: "Vacinas", cor: CORES[2], valores: cortaFuturo(year, d.vacinas) },
        ]}
        rotulos={MESES}
        fmt={inteiro}
        rotuloFoco={(i) => `${MESES_LONGOS[i]}/${year}`}
      />
    </section>
  );
}

/* ---------- Ritmo: curva de fluxo de clientes por hora, por mês ---------- */
export function FluxoMeses({ unit, year }) {
  const [dia, setDia] = useState("");
  const { d, erro } = useApi(`/api/analise/fluxo?unit=${unit}&ano=${year}${dia ? `&dia=${dia}` : ""}`);
  const [escolhidos, setEscolhidos] = useState(null);
  if (!d) return <Aguarde titulo="Curva de fluxo de clientes" erro={erro} />;
  const disponiveis = d.meses.map((x) => x.m);
  const ativos = escolhidos || disponiveis.slice(-4);
  const alternar = (m) => setEscolhidos(ativos.includes(m) ? ativos.filter((x) => x !== m) : [...ativos, m].sort((a, b) => a - b));
  const horas = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}h`);
  return (
    <section className="card span-12">
      <header>
        <h2>Curva de fluxo de clientes · {year}</h2>
        <p>Vendas abertas em cada hora do dia, somadas no mês. Uma linha por mês, para comparar o movimento.</p>
      </header>
      <div className="an-filtro">
        <div className="an-abas" aria-label="Meses">
          {disponiveis.map((m) => (
            <button key={m} type="button" className={ativos.includes(m) ? "on" : ""} onClick={() => alternar(m)} aria-pressed={ativos.includes(m)}>
              <i className="an-cor" style={{ background: CORES[m % CORES.length] }} />
              {MESES[m]}
            </button>
          ))}
        </div>
        <DiaCorte dia={dia} onChange={setDia} />
      </div>
      <Linhas
        series={d.meses.filter((x) => ativos.includes(x.m)).map((x) => ({ nome: MESES_LONGOS[x.m], cor: CORES[x.m % CORES.length], valores: x.valores }))}
        rotulos={horas}
        fmt={inteiro}
        rotuloFoco={(i) => `${String(i).padStart(2, "0")}:00`}
      />
    </section>
  );
}

/* ---------- Recorrência: clientes, recorrentes e novos por mês ---------- */
export function RecorrenciaMensal({ unit, year }) {
  const { d, erro } = useApi(`/api/analise/recorrencia?unit=${unit}&ano=${year}`);
  if (!d) return <Aguarde titulo="Recorrência mês a mês" erro={erro} />;
  const serie = (campo) => cortaFuturo(year, d.meses.map((x) => x[campo]));
  const meses = d.meses.filter((x, m) => serie("clientes")[m] != null);
  return (
    <section className="card span-12">
      <header>
        <h2>Recorrência mês a mês · {year}</h2>
        <p>
          Novo é quem comprou pela primeira vez naquele mês; recorrente é quem já tinha comprado antes.
          {d.historicoDesde === year ? " Este é o primeiro ano do histórico, então quase todo mundo aparece como novo." : ""}
        </p>
      </header>
      <Linhas
        series={[
          { nome: "Clientes", cor: CORES[3], forte: true, valores: serie("clientes") },
          { nome: "Recorrentes", cor: CORES[2], valores: serie("recorrentes") },
          { nome: "Novos", cor: CORES[4], valores: serie("novos") },
        ]}
        rotulos={MESES}
        fmt={inteiro}
        rotuloFoco={(i) => `${MESES_LONGOS[i]}/${year}`}
      />
      <div className="table-wrap">
        <table className="an-tabela">
          <thead>
            <tr>
              <th>Mês</th>
              <th className="num">Clientes</th>
              <th className="num">Recorrentes</th>
              <th className="num">Novos</th>
              <th className="num">% novos</th>
              <th className="num">Faturamento</th>
            </tr>
          </thead>
          <tbody>
            {meses.map((x) => (
              <tr key={x.m}>
                <td>{MESES_LONGOS[x.m]}</td>
                <td className="num">{inteiro(x.clientes)}</td>
                <td className="num">{inteiro(x.recorrentes)}</td>
                <td className="num">{inteiro(x.novos)}</td>
                <td className="num">{x.clientes ? `${Math.round((x.novos / x.clientes) * 100)}%` : "—"}</td>
                <td className="num">{brl(x.fat)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------- DRE: categoria contra a média de 12 meses ---------- */
export function DreMedia({ unit, year, month }) {
  const hoje = hojeBR();
  const padrao = month === "all" ? (year === hoje.getFullYear() ? hoje.getMonth() : 11) : Number(month);
  const [mes, setMes] = useState(padrao);
  useEffect(() => setMes(padrao), [padrao]);
  const [nivel, setNivel] = useState(1);
  const { d, erro } = useApi(`/api/dre/media?unit=${unit}&ano=${year}&mes=${mes}`);
  const emCurso = year === hoje.getFullYear() && mes === hoje.getMonth();
  return (
    <section className="card span-12">
      <header>
        <h2>Despesas contra a média de 12 meses</h2>
        <p>
          Cada conta no mês escolhido ao lado da média dos 12 meses anteriores. Acima da média em vermelho, abaixo em verde. O demonstrativo
          do SimplesVet vem fechado por mês, então aqui não há dia de corte.
          {emCurso ? " O mês escolhido ainda está correndo: o valor vai subir até o fim do mês." : ""}
        </p>
      </header>
      <div className="an-filtro">
        <label className="an-campo">
          Mês
          <select value={mes} onChange={(e) => setMes(Number(e.target.value))}>
            {MESES.map((nome, m) => (
              <option key={nome} value={m} disabled={year === hoje.getFullYear() && m > hoje.getMonth()}>
                {MESES_LONGOS[m]}/{year}
              </option>
            ))}
          </select>
        </label>
        <div className="an-abas" role="tablist" aria-label="Detalhe">
          {[
            [0, "Grupos"],
            [1, "Contas"],
            [2, "Subcontas"],
          ].map(([n, nome]) => (
            <button key={n} type="button" role="tab" aria-selected={nivel === n} className={nivel === n ? "on" : ""} onClick={() => setNivel(n)}>
              {nome}
            </button>
          ))}
        </div>
      </div>
      {!d ? (
        <p className="hint">{erro ? `Não carregou: ${erro}` : "Montando…"}</p>
      ) : !d.temMes ? (
        <p className="hint">
          Sem demonstrativo para {MESES_LONGOS[mes]}/{year}.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="an-tabela">
            <thead>
              <tr>
                <th>Conta</th>
                <th className="num">
                  {MESES[mes]}/{year}
                </th>
                <th className="num">Média ({d.mesesNaMedia} meses)</th>
                <th className="num">Diferença</th>
                <th className="num">%</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d.linhas
                .filter((l) => l.profundidade <= nivel)
                .map((l) => {
                  const acima = l.dif > 0.005;
                  const abaixo = l.dif < -0.005;
                  return (
                    <tr key={l.caminho} className={l.profundidade === 0 ? "an-total" : ""}>
                      <td style={{ paddingLeft: `${8 + l.profundidade * 18}px` }}>{l.nome}</td>
                      <td className="num">{brlc(l.valor)}</td>
                      <td className="num">{l.media == null ? "—" : brlc(l.media)}</td>
                      <td className={`num ${acima ? "an-ruim" : abaixo ? "an-bom" : ""}`}>{l.dif == null ? "—" : brlc(l.dif)}</td>
                      <td className={`num ${acima ? "an-ruim" : abaixo ? "an-bom" : ""}`}>{pct(l.pct)}</td>
                      <td className="an-sinal">{acima ? "▲ acima" : abaixo ? "▼ abaixo" : ""}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ---------- Pesquisa: notas dos tutores ---------- */
export function PesquisaTutores({ unit, year, month }) {
  const mes = month === "all" ? "all" : Number(month);
  const { d, erro } = useApi(`/api/pesquisa?unit=${unit}&ano=${year}&mes=${mes}`);
  if (!d) return <Aguarde titulo="Nota dos tutores" erro={erro} />;
  const maxD = Math.max(1, ...d.distribuicao);
  return (
    <section className="card span-12">
      <header>
        <h2>Nota dos tutores · {mes === "all" ? year : `${MESES_LONGOS[mes]}/${year}`}</h2>
        <p>
          Respostas ao link de avaliação que a recepção manda pelo WhatsApp depois da consulta (aba Veterinários). NPS = % de notas 9 e 10
          menos % de 0 a 6.
        </p>
      </header>
      {!d.respostas ? (
        <p className="hint">Nenhuma resposta no período ainda.</p>
      ) : (
        <>
          <div className="an-numeros">
            <div>
              <small>Média</small>
              <strong>{d.media.toLocaleString("pt-BR")}</strong>
            </div>
            <div>
              <small>NPS</small>
              <strong>{d.nps}</strong>
            </div>
            <div>
              <small>Respostas</small>
              <strong>{inteiro(d.respostas)}</strong>
            </div>
          </div>
          <div className="an-notas" role="list">
            {d.distribuicao.map((n, nota) => (
              <div key={nota} role="listitem">
                <span style={{ height: `${Math.max(3, (n / maxD) * 100)}%` }} className={nota >= 9 ? "pro" : nota <= 6 ? "det" : ""} />
                <b>{nota}</b>
                <small>{n}</small>
              </div>
            ))}
          </div>
          {d.comentarios.length ? (
            <ul className="an-comentarios">
              {d.comentarios.map((c, i) => (
                <li key={i}>
                  <b>{c.nota}</b>
                  <span>{c.comentario}</span>
                  <small>
                    {c.dia.split("-").reverse().join("/")} · {c.funcionario}
                  </small>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}
