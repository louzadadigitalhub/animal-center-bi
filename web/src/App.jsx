import { useEffect, useMemo, useState } from "react";
import { ChartBar } from "@phosphor-icons/react/ChartBar";
import { Stethoscope } from "@phosphor-icons/react/Stethoscope";
import { UsersThree } from "@phosphor-icons/react/UsersThree";
import { PawPrint } from "@phosphor-icons/react/PawPrint";
import { ArrowsClockwise } from "@phosphor-icons/react/ArrowsClockwise";
import { Syringe } from "@phosphor-icons/react/Syringe";
import { ChatCircleDots } from "@phosphor-icons/react/ChatCircleDots";
import { Table } from "@phosphor-icons/react/Table";
import { MonitorPlay } from "@phosphor-icons/react/MonitorPlay";
import { CalendarBlank } from "@phosphor-icons/react/CalendarBlank";
import { List } from "@phosphor-icons/react/List";
import { X } from "@phosphor-icons/react/X";
import { DailyBars, Donut, Hourly, LineChart, Radar, SparkBars } from "./charts";
import { MONTHS, YEARS, brl, getView, num, periodLabel, sanitizeDaily } from "./data";
import MapPanel from "./MapPanel.jsx";

const NAV = [
  { id: "vendas", label: "Vendas", icon: ChartBar },
  { id: "ritmo", label: "Ritmo do dia", icon: Stethoscope },
  { id: "equipe", label: "Equipe", icon: UsersThree },
  { id: "clientes", label: "Clientes", icon: PawPrint },
  { id: "recorrencia", label: "Recorrencia", icon: ArrowsClockwise },
  { id: "vacinas", label: "Vacinas", icon: Syringe },
  { id: "pesquisa", label: "Pesquisa", icon: ChatCircleDots },
  { id: "dre", label: "DRE", icon: Table },
  { id: "tv", label: "TV corredor", icon: MonitorPlay },
];

function Kpi({ label, value, hint, spark, warn }) {
  return (
    <article className={`kpi ${warn ? "warn" : ""}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
      {spark ? <SparkBars values={spark} /> : null}
    </article>
  );
}

function Vendas({ u }) {
  const fatSeries = u.monthlyFat.map((n) => n || 0);
  const groupsDonut = u.grupos.map((g) => ({ nome: g.nome, value: g.valor, hint: brl(g.valor) }));
  const alerts = u.grupos.filter((g) => g.valor < g.media);
  const cx = u.caixa || {
    noDia: 0,
    posteriores: 0,
    adiantamento: 0,
    receitaTotal: u.fat,
    emAberto: Math.max(0, (u.fatVenda || 0) - (u.fat || 0)),
  };
  const daily = sanitizeDaily(u.dailyFat || [], cx.receitaTotal || u.fat);
  const budget = [
    { nome: "Baixa no dia", value: cx.noDia, hint: brl(cx.noDia) },
    { nome: "Baixa depois", value: cx.posteriores, hint: brl(cx.posteriores) },
    { nome: "Adiantamento", value: cx.adiantamento || 0, hint: brl(cx.adiantamento || 0) },
  ];
  const maxG = Math.max(1, ...u.grupos.map((x) => x.valor));
  return (
    <div className="dash">
      <article className="tile tile-dark tile-balance">
        <p>Receita total</p>
        <strong>{brl(cx.receitaTotal || u.fat)}</strong>
        <small>Recebimentos do recorte. Nao e DRE.</small>
        <div className="mini-kpis">
          <div>
            <span>No dia da venda</span>
            <b>{brl(cx.noDia)}</b>
          </div>
          <div>
            <span>Posteriores</span>
            <b>{brl(cx.posteriores)}</b>
          </div>
        </div>
        <SparkBars values={fatSeries} />
      </article>

      <section className="tile tile-inflow">
        <header>
          <h2>Entrada</h2>
          <p>Caixa por dia (data da baixa)</p>
        </header>
        {daily.length ? <DailyBars days={daily} h={220} /> : <p className="hint">Abra um mes para ver o dia a dia.</p>}
      </section>

      <section className="tile tile-structure">
        <header>
          <h2>Estrutura</h2>
          <p>Participacao por grupo</p>
        </header>
        <Radar slices={groupsDonut} />
      </section>

      <article className="tile tile-goals">
        <p>Em aberto</p>
        <strong>{brl(cx.emAberto)}</strong>
        <small>Ainda nao baixou no caixa · adiantamento {brl(cx.adiantamento || 0)}</small>
        <div className="goal-line">
          <span>Eletivas vs meta</span>
          <b>{u.eletivasPct}%</b>
        </div>
        <div className="track">
          <i style={{ width: `${Math.min(100, u.eletivasPct || 0)}%` }} />
        </div>
        <small>
          {u.eletivas} de {u.metaEletivas} · ticket {brl(u.ticketCliente)}
        </small>
      </article>

      <section className="tile tile-budget">
        <header>
          <h2>Recebimentos</h2>
          <p>Como o dinheiro entrou</p>
        </header>
        <Donut slices={budget} totalLabel="Caixa" totalValue={brl(cx.receitaTotal || u.fat)} />
      </section>

      <section className="tile tile-costs">
        <header>
          <h2>Grupos</h2>
          <p>Pilares da clinica</p>
        </header>
        <Donut slices={groupsDonut} totalLabel="Vendas" totalValue={brl(u.fatVenda || u.fat)} />
      </section>

      <section className="tile tile-compare">
        <header>
          <h2>Grupos vs media</h2>
          <p>Alarme se cair da media</p>
        </header>
        <div className="bars">
          {u.grupos.map((g) => (
            <div key={g.nome} className={g.valor < g.media ? "row warn" : "row"}>
              <span>{g.nome}</span>
              <div className="track">
                <i style={{ width: `${Math.min(100, (g.valor / maxG) * 100)}%` }} />
              </div>
              <b>{brl(g.valor)}</b>
              <em className={g.vsAno < 0 ? "down" : "up"}>
                {g.vsAno > 0 ? "+" : ""}
                {g.vsAno}%
              </em>
            </div>
          ))}
        </div>
        {alerts.length ? (
          <ul className="alerts">
            {alerts.map((g) => (
              <li key={g.nome}>
                {g.nome} abaixo da media ({brl(g.valor)} vs {brl(g.media)})
              </li>
            ))}
          </ul>
        ) : (
          <p className="ok">Nenhum grupo abaixo da media neste recorte.</p>
        )}
      </section>

      <section className="tile tile-dark tile-annual">
        <header>
          <h2>Anos</h2>
          <p>Recebimento no mesmo recorte</p>
        </header>
        <ol className="year-list">
          {u.compareYears.map((c) => (
            <li key={c.ano} className={c.ano === 2026 ? "now" : ""}>
              <span>{c.ano}</span>
              <b>{brl(c.fat)}</b>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Ritmo({ u }) {
  return (
    <div className="bento">
      <Kpi label="Consultas" value={num(u.consultas)} />
      <Kpi label="Emergencias" value={num(u.emergencia)} />
      <Kpi label="Internacoes" value={num(u.internacao)} />
      <Kpi label="Exames" value={num(u.examesQtd)} />
      <Kpi
        label="Atendimentos"
        value={num(u.atendimentos)}
        hint={`${u.consultas} consultas + ${u.vacinasAplicadas} vacinas (remuneracao)`}
      />
      <Kpi
        label="Eletivas vs meta"
        value={`${u.eletivasPct}%`}
        hint={`${u.eletivas} de ${u.metaEletivas}`}
        warn={u.eletivasPct < 80}
      />
      <section className="card span-12">
        <header>
          <h2>Fluxo por hora</h2>
          <p>Quando a casa enche. Base do plantao.</p>
        </header>
        <div className="hourly-scroll">
          <Hourly values={u.hourly} />
        </div>
      </section>
    </div>
  );
}

function Equipe({ u, onOpen }) {
  const maxFat = Math.max(1, ...u.equipe.map((p) => p.fat));
  return (
    <div className="bento">
      <section className="card span-12">
        <header>
          <h2>Ranking</h2>
          <p>Base da TV do corredor. Ticket da pessoa vs o dela.</p>
        </header>
        <div className="table-wrap">
          <table className="rank">
            <thead>
              <tr>
                <th>#</th>
                <th>Pessoa</th>
                {u.id === "consolidado" ? <th>Casa</th> : null}
                <th>Faturamento</th>
                <th></th>
                <th>Vendas</th>
                <th>Ticket</th>
                <th>Novos</th>
              </tr>
            </thead>
            <tbody>
              {u.equipe.map((p, i) => (
                <tr key={p.nome + (p.casa || "")} className="click" onClick={() => onOpen({ type: "pessoa", payload: p })}>
                  <td>{i + 1}</td>
                  <td>{p.nome}</td>
                  {u.id === "consolidado" ? <td>{p.casa}</td> : null}
                  <td>{brl(p.fat)}</td>
                  <td className="mini">
                    <div className="track">
                      <i style={{ width: `${(p.fat / maxFat) * 100}%` }} />
                    </div>
                  </td>
                  <td>{p.vendas}</td>
                  <td>{brl(p.ticket)}</td>
                  <td>{p.novos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Clientes({ u, onOpen }) {
  const orig = (u.origem || []).map((o) => ({ nome: o.nome, value: o.valor, hint: num(o.valor) }));
  const racas = u.racas || [];
  const especies = u.especies || [];
  const lista = u.clientes || [];
  return (
    <div className="bento">
      <Kpi label="Tutores no recorte" value={num(lista.length || u.novos)} hint="Clique no mapa ou na lista" />
      <Kpi label="Pacientes (animais)" value={num(lista.reduce((a, c) => a + (c.animais?.length || 0), 0))} />
      <Kpi label="Caninos" value={num(especies.find((e) => /canin/i.test(e.nome))?.n || 0)} />
      <Kpi label="Felinos" value={num(especies.find((e) => /felin/i.test(e.nome))?.n || 0)} />

      <section className="card span-8">
        <header>
          <h2>Onde os tutores moram</h2>
          <p>Alfinete por bairro, a partir do CEP e endereco cadastrados. Paciente = animal.</p>
        </header>
        <MapPanel points={u.mapPoints || []} onSelect={(p) => onOpen({ type: "bairro", payload: p })} />
      </section>

      <section className="card span-4">
        <header>
          <h2>Racas mais atendidas</h2>
          <p>O BI antigo nao destacava isso. Clique para abrir.</p>
        </header>
        <div className="bars">
          {racas.slice(0, 8).map((r) => (
            <div key={r.nome} className="row click" onClick={() => onOpen({ type: "raca", payload: r })}>
              <span>{r.nome}</span>
              <div className="track">
                <i style={{ width: `${(r.n / Math.max(1, ...racas.map((x) => x.n))) * 100}%` }} />
              </div>
              <b>{num(r.n)}</b>
            </div>
          ))}
        </div>
      </section>

      <section className="card span-12">
        <header>
          <h2>Tutores</h2>
          <p>Clique a linha para ver ficha, pets e contato.</p>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tutor</th>
                <th>Bairro</th>
                <th>Pets</th>
                <th>Itens</th>
                <th>Faturamento</th>
              </tr>
            </thead>
            <tbody>
              {lista.slice(0, 40).map((c) => (
                <tr key={c.codigo || c.nome} className="click" onClick={() => onOpen({ type: "cliente", payload: c })}>
                  <td>{c.nome}</td>
                  <td>{c.bairro || "-"}</td>
                  <td>{(c.animais || []).map((a) => a.nome).join(", ") || "-"}</td>
                  <td>{c.itens}</td>
                  <td>{brl(c.fat)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {orig.length ? (
        <section className="card span-12">
          <header>
            <h2>Origem do cliente novo</h2>
            <p>Quando o SimplesVet trouxer Instagram/Facebook/Google separados, aparece aqui.</p>
          </header>
          <Donut slices={orig} totalLabel="Novos" totalValue={num(u.novos)} />
        </section>
      ) : null}
    </div>
  );
}

function Recorrencia({ u }) {
  const stacked = u.monthlyQtd.map((n, i) => Math.round(n * 0.72));
  return (
    <div className="bento">
      <Kpi label="Ativos no recorte" value={num(u.recorrentes)} />
      <Kpi label="Novos" value={num(u.novos)} />
      <Kpi label="Pre-inativos (est.)" value={num(Math.round(u.recorrentes * 0.09))} hint="Sem visita recente" />
      <Kpi label="NPS" value={u.nps.nota} hint={`${u.nps.respostas} respostas`} />
      <section className="card span-7">
        <header>
          <h2>Recorrentes vs faturamento</h2>
        </header>
        <LineChart series={u.monthlyFat} labels={MONTHS.map((m) => m[0])} />
        <p className="hint">Linha de faturamento no ano. Recorrentes estimados: {num(stacked.reduce((a, b) => a + b, 0))} visitas.</p>
      </section>
      <section className="card span-5">
        <header>
          <h2>Fluxo por hora</h2>
        </header>
        <div className="hourly-scroll">
          <Hourly values={u.hourly} />
        </div>
      </section>
    </div>
  );
}

function Vacinas({ u, onOpen }) {
  const top = u.vacinasTop || u.vacinas || [];
  const total = top.reduce((a, v) => a + (v.n || v.aplicada || v.total || 0), 0);
  return (
    <div className="bento">
      <Kpi label="Doses no recorte" value={num(total)} hint="So o que saiu na venda (nao o estoque)" />
      <Kpi label="Tipos" value={num(top.length)} />
      <section className="card span-5">
        <header>
          <h2>Vacinas mais usadas</h2>
          <p>O BI antigo nao ranqueava por produto. Clique para filtrar.</p>
        </header>
        <Donut
          slices={top.slice(0, 6).map((v) => ({ nome: v.nome, value: v.n || v.total || 0, hint: num(v.n || v.total || 0) }))}
          totalLabel="Doses"
          totalValue={num(total)}
        />
      </section>
      <section className="card span-7">
        <header>
          <h2>Ranking de vacinas</h2>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Vacina</th>
                <th>Doses</th>
              </tr>
            </thead>
            <tbody>
              {top.map((v, i) => (
                <tr key={v.nome} className="click" onClick={() => onOpen({ type: "vacina", payload: v })}>
                  <td>{i + 1}</td>
                  <td>{v.nome}</td>
                  <td>{v.n || v.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Pesquisa({ u }) {
  return (
    <div className="bento">
      <Kpi label="NPS" value={u.nps.nota} hint="0 a 10" />
      <Kpi label="Respostas" value={num(u.nps.respostas)} />
      <Kpi label="Promotores (est.)" value={`${Math.round((u.nps.nota / 10) * 68)}%`} />
      <section className="card span-12">
        <header>
          <h2>Pesquisa de satisfacao</h2>
          <p>No BI antigo isso estava fora do ar (Pangeia). Aqui a nota entra no recorte.</p>
        </header>
        <p className="body">
          Comentarios individuais ficam so com a gestao. A TV e o time nao veem texto de tutor.
        </p>
      </section>
    </div>
  );
}

function Dre({ u }) {
  return (
    <div className="bento">
      <section className="card span-12">
        <header>
          <h2>DRE {u.id === "consolidado" ? "consolidada" : `da ${u.nome.toLowerCase()}`}</h2>
          <p>
            {u.id === "consolidado"
              ? "As duas casas. Cada linha diz de onde veio. Custo ainda e rascunho ate o financeiro entrar."
              : "Receita menos custo desta casa."}
          </p>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Linha</th>
                <th>Valor</th>
                {u.id === "consolidado" ? (
                  <>
                    <th>Matriz</th>
                    <th>Filial</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {u.dre.map((row) => (
                <tr key={row.linha} className={row.destaque ? "now" : ""}>
                  <td>{row.linha}</td>
                  <td className={row.valor < 0 ? "down" : ""}>{brl(row.valor)}</td>
                  {u.id === "consolidado" ? (
                    <>
                      <td>{brl(row.matriz || 0)}</td>
                      <td>{brl(row.filial || 0)}</td>
                    </>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Drawer({ detail, onClose }) {
  if (!detail) return null;
  const { type, payload: p } = detail;
  return (
    <div className="drawer-bg" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="x" onClick={onClose}>
          Fechar
        </button>
        {type === "cliente" && (
          <>
            <h2>{p.nome}</h2>
            <p className="hint">Ficha do tutor. Pacientes sao os animais.</p>
            <dl>
              <div>
                <dt>Codigo</dt>
                <dd>{p.codigo || "-"}</dd>
              </div>
              <div>
                <dt>Endereco</dt>
                <dd>
                  {p.endereco || "-"} {p.numero || ""} · {p.bairro || ""} · {p.cep || ""} · {p.cidade || ""}
                </dd>
              </div>
              <div>
                <dt>Contato</dt>
                <dd>
                  {p.celular || "-"} · {p.email || "-"}
                </dd>
              </div>
              <div>
                <dt>Neste recorte</dt>
                <dd>
                  {p.itens} itens · {brl(p.fat)}
                </dd>
              </div>
            </dl>
            <h3>Pets</h3>
            <ul>
              {(p.animais || []).map((a) => (
                <li key={a.nome}>
                  <b>{a.nome}</b> · {a.especie || "especie?"} · {a.raca || "raca?"} · {a.n} atend.
                </li>
              ))}
            </ul>
          </>
        )}
        {type === "raca" && (
          <>
            <h2>{p.nome}</h2>
            <p>{num(p.n)} atendimentos desta raca no recorte.</p>
          </>
        )}
        {type === "vacina" && (
          <>
            <h2>{p.nome}</h2>
            <p>{num(p.n || p.total)} doses vendidas neste recorte.</p>
          </>
        )}
        {type === "pessoa" && (
          <>
            <h2>{p.nome}</h2>
            <p>
              {p.casa} · {brl(p.fat)} · {p.vendas} vendas · ticket {brl(p.ticket)}
            </p>
          </>
        )}
        {type === "bairro" && (
          <>
            <h2>{p.bairro || p.label}</h2>
            <p>
              {num(p.n)} atendimentos · {brl(p.fat || 0)}
            </p>
          </>
        )}
      </aside>
    </div>
  );
}

function Tv({ u }) {
  return (
    <div className="tv">
      <p>Telao do corredor. Sem login. Sem DRE. Sem telefone.</p>
      <ol>
        {u.equipe.slice(0, 8).map((p, i) => (
          <li key={p.nome}>
            <b>{i + 1}</b>
            <span>{p.nome}</span>
            <em>{brl(p.fat)}</em>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState("vendas");
  const [unit, setUnit] = useState("matriz");
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(8);
  const [live, setLive] = useState(null);
  const [detail, setDetail] = useState(null);
  const [menu, setMenu] = useState(false);
  const go = (id) => {
    setPage(id);
    setMenu(false);
  };
  const DOCK = [
    { id: "vendas", label: "Vendas", icon: ChartBar },
    { id: "clientes", label: "Clientes", icon: PawPrint },
    { id: "equipe", label: "Equipe", icon: UsersThree },
    { id: "vacinas", label: "Vacinas", icon: Syringe },
  ];
  const demo = useMemo(() => getView(unit, year, month), [unit, year, month]);
  const u = live?.view ? { ...demo, ...live.view } : demo;
  const label = periodLabel(year, month);
  const fonte = live?.ok
    ? `SimplesVet ${live.rows} vendas · ${new Date(live.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
    : "Aguardando robô";
  const api = import.meta.env.VITE_API_URL || "";

  useEffect(() => {
    const q = `${api}/api/snapshot?unit=${unit}&year=${year}&month=${month}`;
    fetch(q)
      .then((r) => r.json())
      .then((j) => setLive(j.ok ? j : { ok: false }))
      .catch(() => setLive({ ok: false }));
  }, [api, unit, year, month]);

  return (
    <div className={`app ${menu ? "menu-open" : ""}`}>
      <header className="mob-top">
        <button className="burger" aria-label="Abrir menu" onClick={() => setMenu((v) => !v)}>
          {menu ? <X size={22} /> : <List size={22} />}
        </button>
        <img src="/logo.png" alt="Animal Center System" />
        <span />
      </header>
      {menu ? <div className="scrim" onClick={() => setMenu(false)} /> : null}
      <header className="topbar">
        <div className="brand">
          <img className="mark" src="/icon-192.png" alt="" />
          <img className="word" src="/logo.png" alt="Animal Center System" />
        </div>
        <nav className="top-nav">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={page === item.id ? "on" : ""} onClick={() => go(item.id)}>
                <Icon size={16} weight={page === item.id ? "fill" : "regular"} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="period">
          {YEARS.map((y) => (
            <button key={y} className={year === y ? "on" : ""} onClick={() => setYear(y)}>
              {y}
            </button>
          ))}
        </div>
      </header>
      <aside>
        <div className="brand">
          <img className="mark" src="/icon-192.png" alt="" />
          <img className="word" src="/logo.png" alt="Animal Center System" />
        </div>
        <nav>
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={page === item.id ? "on" : ""} onClick={() => go(item.id)}>
                <Icon size={18} weight={page === item.id ? "fill" : "regular"} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="main">
        <header className="top">
          <div className="units">
            {[
              ["matriz", "Matriz"],
              ["filial", "Filial 1"],
              ["consolidado", "As duas"],
            ].map(([id, lb]) => (
              <button key={id} className={unit === id ? "on" : ""} onClick={() => setUnit(id)}>
                {lb}
              </button>
            ))}
          </div>
          <div className="period">
            <CalendarBlank size={16} />
            {YEARS.map((y) => (
              <button key={y} className={year === y ? "on" : ""} onClick={() => setYear(y)}>
                {y}
              </button>
            ))}
            <select value={month} onChange={(e) => setMonth(e.target.value === "all" ? "all" : Number(e.target.value))}>
              <option value="all">Ano todo</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i} disabled={year === 2026 && i > 8}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </header>

        <div className="crumb">
          <h1>{NAV.find((n) => n.id === page)?.label}</h1>
          <p>
            <span>
              {u.casa} · {label}
            </span>
            <span className={live?.ok ? "pill-live" : "pill-wait"}>{fonte}</span>
          </p>
        </div>

        {page === "vendas" && <Vendas u={u} />}
        {page === "ritmo" && <Ritmo u={u} />}
        {page === "equipe" && <Equipe u={u} onOpen={setDetail} />}
        {page === "clientes" && <Clientes u={u} onOpen={setDetail} />}
        {page === "recorrencia" && <Recorrencia u={u} />}
        {page === "vacinas" && <Vacinas u={u} onOpen={setDetail} />}
        {page === "pesquisa" && <Pesquisa u={u} />}
        {page === "dre" && <Dre u={u} />}
        {page === "tv" && <Tv u={u} />}
      </div>
      <nav className="dock" aria-label="Atalhos">
        {DOCK.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={page === item.id ? "on" : ""} onClick={() => go(item.id)}>
              <Icon size={20} weight={page === item.id ? "fill" : "regular"} />
              {item.label}
            </button>
          );
        })}
        <button className={menu ? "on" : ""} onClick={() => setMenu((v) => !v)}>
          <List size={20} />
          Menu
        </button>
      </nav>
      <Drawer detail={detail} onClose={() => setDetail(null)} />
    </div>
  );
}
