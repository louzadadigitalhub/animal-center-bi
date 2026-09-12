import { useEffect, useMemo, useRef, useState } from "react";
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
import { Sun } from "@phosphor-icons/react/Sun";
import { Moon } from "@phosphor-icons/react/Moon";
import { DailyBars, Donut, Hourly, LineChart, Radar, SparkBars } from "./charts";
import { MONTHS, YEARS, brl, getView, num, periodLabel, sanitizeDaily } from "./data";
import MapPanel from "./MapPanel.jsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card.jsx";
import { Num } from "./anim.jsx";
import Podium, { Ambient } from "./Podium.jsx";
import { Toaster, sileo } from "sileo";
import "sileo/styles.css";
import { Badge } from "./components/ui/badge.jsx";

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

function Vendas({ u, year }) {
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
      <div className="dash-col">
        <Card className="tile tile-dark tile-balance">
          <CardHeader>
            <CardDescription>Receita total</CardDescription>
            <CardTitle>
              <Num value={cx.receitaTotal || u.fat} format={brl} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="hint">Recebimentos do recorte. Nao e DRE.</p>
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
          </CardContent>
        </Card>
        <Card className="tile tile-goals">
          <CardHeader>
            <CardDescription>Em aberto</CardDescription>
            <CardTitle>
              <Num value={cx.emAberto} format={brl} />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="hint">Ainda nao baixou no caixa · adiantamento {brl(cx.adiantamento || 0)}</p>
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
          </CardContent>
        </Card>
      </div>

      <div className="dash-col">
        <Card className="tile tile-inflow">
          <CardHeader>
            <CardTitle>Entrada</CardTitle>
            <CardDescription>Caixa por dia (data da baixa)</CardDescription>
          </CardHeader>
          <CardContent>
            {daily.length ? <DailyBars days={daily} h={340} /> : <p className="hint">Abra um mes para ver o dia a dia.</p>}
          </CardContent>
        </Card>
        <Card className="tile tile-budget">
          <CardHeader>
            <CardTitle>Recebimentos</CardTitle>
            <CardDescription>Como o dinheiro entrou</CardDescription>
          </CardHeader>
          <CardContent>
            <Donut slices={budget} totalLabel="Caixa" totalValue={brl(cx.receitaTotal || u.fat)} />
          </CardContent>
        </Card>
        <Card className="tile tile-compare">
          <CardHeader>
            <CardTitle>Grupos vs media</CardTitle>
            <CardDescription>Alarme se cair da media</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      </div>

      <div className="dash-col">
        <Card className="tile tile-structure">
          <CardHeader>
            <CardTitle>Estrutura</CardTitle>
            <CardDescription>Participacao por grupo</CardDescription>
          </CardHeader>
          <CardContent>
            <Radar slices={groupsDonut} />
          </CardContent>
        </Card>
        <Card className="tile tile-costs">
          <CardHeader>
            <CardTitle>Grupos</CardTitle>
            <CardDescription>Pilares da clinica</CardDescription>
          </CardHeader>
          <CardContent>
            <Donut slices={groupsDonut} totalLabel="Vendas" totalValue={brl(u.fatVenda || u.fat)} />
          </CardContent>
        </Card>
        {(u.compareYears || []).filter((c) => c.qtd || c.fat).length > 1 ? (
          <Card className="tile tile-dark tile-annual">
            <CardHeader>
              <CardTitle>Anos</CardTitle>
              <CardDescription>Recebimento no mesmo recorte</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="year-list">
                {u.compareYears
                  .filter((c) => c.qtd || c.fat)
                  .map((c) => (
                    <li key={c.ano} className={c.ano === year ? "now" : ""}>
                      <span>{c.ano}</span>
                      <b>{brl(c.fat)}</b>
                    </li>
                  ))}
              </ol>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function Ritmo({ u, hoje }) {
  const r = hoje || u;
  return (
    <div className="bento">
      <Kpi label="Consultas hoje" value={num(r.consultas)} hint={r.diaLabel || "Dia atual"} />
      <Kpi label="Emergencias hoje" value={num(r.emergencia)} />
      <Kpi label="Internacoes hoje" value={num(r.internacao)} />
      <Kpi label="Exames hoje" value={num(r.examesQtd)} />
      <Kpi
        label="Atendimentos hoje"
        value={num(r.atendimentos)}
        hint={`${r.consultas} consultas + ${r.vacinasAplicadas} vacinas`}
      />
      <Kpi
        label="Caixa hoje"
        value={brl(r.caixa?.receitaTotal || r.fat || 0)}
        hint={r.diaLabel ? `Recebimentos de ${r.diaLabel}` : "Recebimentos do dia"}
      />
      <section className="card span-12">
        <header>
          <h2>Fluxo por hora</h2>
          <p>{r.diaLabel ? `Somente ${r.diaLabel}, horario de Brasilia.` : "Quando a casa enche hoje."}</p>
        </header>
        <div className="hourly-scroll">
          <Hourly values={r.hourly || Array(24).fill(0)} />
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
          <p>Cada alfinete e um tutor, no endereco do cadastro. Clique para abrir a ficha.</p>
        </header>
        <MapPanel
          points={u.mapPoints || []}
          clients={lista}
          onSelect={(p) => onOpen({ type: p.kind || "cliente", payload: p.payload || p })}
        />
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

function Tv({ u, label, fotos }) {
  const total = u.equipe.reduce((a, p) => a + (p.fat || 0), 0);
  return (
    <div className="tv">
      <Ambient />
      <header className="tv-head">
        <div>
          <p className="tv-kicker">Ranking do time</p>
          <h2 className="tv-title">{u.casa}</h2>
          <p className="tv-sub">{label} · sem login, sem DRE, sem telefone</p>
        </div>
        <div className="tv-total">
          <span>Total do time</span>
          <strong>
            <Num value={total} format={brl} ms={1600} />
          </strong>
        </div>
      </header>
      <Podium equipe={u.equipe} brl={brl} fotos={fotos} />
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
  const [theme, setTheme] = useState(() => localStorage.getItem("ac-theme") || "dark");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#e9eff8" : "#081527");
    localStorage.setItem("ac-theme", theme);
  }, [theme]);

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
  const yearsOn = [...new Set([...(live?.years || []), ...(u.compareYears || []).filter((c) => c.qtd || c.fat).map((c) => c.ano), year])].filter(Boolean).sort((a, b) => a - b);
  const label = periodLabel(year, month);
  const fonte = live?.ok
    ? `SimplesVet ${live.rows} vendas · ${new Date(live.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
    : "Aguardando robô";
  const api = import.meta.env.VITE_API_URL || "";
  const [tentativa, setTentativa] = useState(0);
  /* O snapshot e rebuscado a cada troca de unidade/ano/mes. Avisar em toda
     falha viraria enxurrada, entao so avisamos quando o estado VIRA. */
  const ultimoOk = useRef(null);

  useEffect(() => {
    let vivo = true;
    const q = `${api}/api/snapshot?unit=${unit}&year=${year}&month=${month}`;
    fetch(q)
      .then((r) => r.json())
      .then((j) => (j.ok ? j : { ok: false }))
      .catch(() => ({ ok: false }))
      .then((j) => {
        if (!vivo) return;
        setLive(j);
        const antes = ultimoOk.current;
        if (!j.ok && antes !== false) {
          sileo.error({
            title: "Robô fora do ar",
            description: "Os números na tela são a última leitura guardada.",
            duration: 8000,
            button: { title: "Tentar de novo", onClick: () => setTentativa((n) => n + 1) },
          });
        } else if (j.ok && antes === false) {
          sileo.success({ title: "Robô voltou", description: "Números atualizados." });
        }
        ultimoOk.current = !!j.ok;
      });
    return () => {
      vivo = false;
    };
  }, [api, unit, year, month, tentativa]);

  return (
    <div className={`app ${menu ? "menu-open" : ""}`}>
      <header className="mob-top">
        <button className="burger" aria-label="Abrir menu" onClick={() => setMenu((v) => !v)}>
          {menu ? <X size={22} /> : <List size={22} />}
        </button>
        <strong>
          <img src={theme === "light" ? "/logo-light.png" : "/logo-dark.png"} alt="" width="22" height="22" />
          Animal Center
        </strong>
        <span />
      </header>
      {menu ? <div className="scrim" onClick={() => setMenu(false)} /> : null}
      <aside>
        <div className="logo">
          <img src={theme === "light" ? "/logo-light.png" : "/logo-dark.png"} alt="" width="38" height="38" />
          <div>
            <strong>Animal Center</strong>
            <small>Gestao</small>
          </div>
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
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Ano">
              {yearsOn.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <select value={month} onChange={(e) => setMonth(e.target.value === "all" ? "all" : Number(e.target.value))} aria-label="Mes">
              <option value="all">Ano todo</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i} disabled={year === 2026 && i > 8}>
                  {m}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="theme-toggle"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              aria-label={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
              title={theme === "dark" ? "Tema claro" : "Tema escuro"}
            >
              {theme === "dark" ? <Sun size={18} weight="fill" /> : <Moon size={18} weight="fill" />}
            </button>
          </div>
        </header>

        <div className="crumb">
          <h1>{NAV.find((n) => n.id === page)?.label}</h1>
          <div className="crumb-meta">
            <span>
              {u.casa} · {label}
            </span>
            <Badge variant={live?.ok ? "default" : "outline"} className={live?.ok ? "pill-live border-0" : "pill-wait"}>
              {fonte}
            </Badge>
          </div>
        </div>

        {page === "vendas" && <Vendas u={u} year={year} />}
        {page === "ritmo" && <Ritmo u={u} hoje={live?.hoje} />}
        {page === "equipe" && <Equipe u={u} onOpen={setDetail} />}
        {page === "clientes" && <Clientes u={u} onOpen={setDetail} />}
        {page === "recorrencia" && <Recorrencia u={u} />}
        {page === "vacinas" && <Vacinas u={u} onOpen={setDetail} />}
        {page === "pesquisa" && <Pesquisa u={u} />}
        {page === "dre" && <Dre u={u} />}
        {page === "tv" && <Tv u={u} label={label} fotos={live?.fotos} />}
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
      <Toaster position="bottom-right" theme={theme} offset={{ bottom: 20, right: 20 }} />
    </div>
  );
}
