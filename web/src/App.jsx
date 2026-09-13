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
import { DailyBars, Donut, Hourly, LineChart, Radar, MultiLine, SparkBars, Treemap, VolumeTicket } from "./charts";
import { MONTHS, YEARS, brl, getView, hojeBR, num, periodLabel, sanitizeDaily } from "./data";
import MapPanel from "./MapPanel.jsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card.jsx";
import { Num } from "./anim.jsx";
import Podium, { Ambient } from "./Podium.jsx";
import { Toaster, sileo } from "sileo";
import { apiFetch, supa, supaConfigurado } from "./supa.js";
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
  { id: "tv", label: "Ranking", icon: MonitorPlay },
];

/* So vira clicavel quando ha registro por tras. Card que abre gaveta vazia
   ensina a pessoa a nao clicar em card nenhum. */
function Kpi({ label, value, hint, spark, warn, onOpen }) {
  const clicavel = typeof onOpen === "function";
  return (
    <article
      className={`kpi ${warn ? "warn" : ""} ${clicavel ? "click" : ""}`}
      onClick={clicavel ? onOpen : undefined}
      onKeyDown={clicavel ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen()) : undefined}
      role={clicavel ? "button" : undefined}
      tabIndex={clicavel ? 0 : undefined}
    >
      <p>{label}</p>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
      {spark ? <SparkBars values={spark} /> : null}
      {clicavel ? <span className="kpi-abrir" aria-hidden>ver lista</span> : null}
    </article>
  );
}

function Vendas({ u, year, porMes }) {
  const [campoAno, setCampoAno] = useState("fat");
  /* No recorte de ano o dia a dia nao existe: a mesma barra passa a ser
     mensal em vez de mostrar "abra um mes" e nao mostrar nada. */
  const mesesComoDias = (u.monthlyFat || []).map((fat, i) => ({ d: i + 1, fat: Math.round(fat || 0) }));
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
            <CardDescription>{porMes ? "Caixa por mes (data da baixa)" : "Caixa por dia (data da baixa)"}</CardDescription>
          </CardHeader>
          <CardContent>
            {porMes ? (
              <DailyBars days={mesesComoDias} h={340} rotulos={MONTHS} />
            ) : daily.length ? (
              <DailyBars days={daily} h={340} />
            ) : (
              <p className="hint">Sem movimento neste recorte.</p>
            )}
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
        <Card className="tile tile-anos">
          <CardHeader>
            <CardTitle>Anos sobrepostos</CardTitle>
            <CardDescription>Cada linha e um ano; a cheia e o corrente</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="anos-abas">
              {[
                ["fat", "Faturamento", brl],
                ["qtd", "Qtd de venda", num],
                ["ticketVenda", "Valor medio/venda", brl],
                ["ticketCliente", "Valor medio/cliente", brl],
              ].map(([campo, rotulo, f]) => (
                <button
                  key={campo}
                  className={campoAno === campo ? "on" : ""}
                  onClick={() => setCampoAno(campo)}
                >
                  {rotulo}
                </button>
              ))}
            </div>
            <MultiLine
              porAno={u.monthlyPorAno || {}}
              campo={campoAno}
              fmt={campoAno === "qtd" ? num : brl}
            />
          </CardContent>
        </Card>

        <Card className="tile tile-compare">
          <CardHeader>
            <CardTitle>Grupos vs media</CardTitle>
            <CardDescription>Media mensal do grupo no ano · variacao vs mesmo periodo do ano passado</CardDescription>
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
                {g.vsAno == null ? (
                  <em className="share" title="Sem o mesmo periodo no ano passado">
                    —
                  </em>
                ) : (
                  <em className={g.vsAno < 0 ? "down" : "up"} title={`Ano passado: ${brl(g.anoPassado || 0)}`}>
                    {g.vsAno > 0 ? "+" : ""}
                    {g.vsAno}%
                  </em>
                )}
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
            <CardTitle>Faturamento por pilar</CardTitle>
            <CardDescription>Area = participacao no total</CardDescription>
          </CardHeader>
          <CardContent>
            <Treemap slices={groupsDonut} brl={brl} />
          </CardContent>
        </Card>
        {(u.compareYears || []).filter((c) => c.qtd || c.fat).length > 1 ? (
          <Card className="tile tile-dark">
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

function Ritmo({ u, hoje, onOpen }) {
  const r = hoje || u;
  return (
    <div className="bento">
      <Kpi label="Consultas hoje" value={num(r.consultas)} hint={r.diaLabel || "Dia atual"} />
      <Kpi label="Emergencias hoje" value={num(r.emergencia)} />
      <Kpi label="Internacoes hoje" value={num(r.internacao)} />
      <Kpi label="Exames hoje" value={num(r.examesQtd)} />
      {/* So estes dois tem registro por tras no recorte do dia: a lista de
          tutores e a quebra por grupo. Consultas, emergencias, internacoes e
          exames chegam ja somados, sem linha individual. */}
      <Kpi
        label="Atendimentos hoje"
        value={num(r.atendimentos)}
        hint={`${r.consultas} consultas + ${r.vacinasAplicadas} vacinas`}
        onOpen={
          (r.clientes || []).length
            ? () =>
                onOpen(
                  listaTutores(
                    "Atendimentos de hoje",
                    `${r.clientes.length} tutores com venda em ${r.diaLabel || "hoje"}.`,
                    r.clientes
                  )
                )
            : undefined
        }
      />
      <Kpi
        label="Caixa hoje"
        value={brl(r.caixa?.receitaTotal || r.fat || 0)}
        hint={r.diaLabel ? `Recebimentos de ${r.diaLabel}` : "Recebimentos do dia"}
        onOpen={
          (r.grupos || []).some((g) => g.valor)
            ? () =>
                onOpen({
                  type: "lista",
                  payload: {
                    titulo: "Caixa de hoje por grupo",
                    resumo: `${brl(r.caixa?.receitaTotal || r.fat || 0)} em ${r.diaLabel || "hoje"}.`,
                    itens: [...r.grupos]
                      .filter((g) => g.valor)
                      .sort((a, b) => b.valor - a.valor)
                      .map((g) => ({ chave: g.nome, nome: g.nome, nota: "grupo", valor: brl(g.valor) })),
                  },
                })
            : undefined
        }
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
          <h2>Volume x ticket</h2>
          <p>Barra e quantidade de vendas, ponto e ticket medio. Quem vende muito nem sempre vende caro.</p>
        </header>
        <VolumeTicket pessoas={u.equipe} brl={brl} />
      </section>
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

/* Montam a carga da gaveta a partir dos registros que o robo ja traz.
   Cada item volta a apontar para a ficha do tutor, entao da para descer
   do numero ate a pessoa sem sair da gaveta. */
function itemTutor(c) {
  return {
    chave: c.codigo || c.nome,
    nome: c.nome,
    nota: [c.bairro, c.cidade].filter(Boolean).join(" · ") || "sem endereco",
    valor: brl(c.fat),
    abrir: { type: "cliente", payload: c },
  };
}

function listaTutores(titulo, resumo, lista) {
  return {
    type: "lista",
    payload: { titulo, resumo, itens: [...lista].sort((a, b) => b.fat - a.fat).map(itemTutor) },
  };
}

function listaPets(lista) {
  const pets = [];
  for (const c of lista) {
    for (const a of c.animais || []) {
      pets.push({
        chave: `${c.codigo || c.nome}-${a.nome}`,
        nome: a.nome,
        nota: `${a.especie || "especie?"} · ${a.raca || "raca?"} · tutor ${c.nome}`,
        valor: `${a.n} atend.`,
        abrir: { type: "cliente", payload: c },
      });
    }
  }
  pets.sort((a, b) => parseInt(b.valor) - parseInt(a.valor));
  return {
    type: "lista",
    payload: { titulo: "Pacientes no recorte", resumo: `${pets.length} animais atendidos.`, itens: pets },
  };
}

/* O numero do card e atendimento; a lista e de tutor. Sao grandezas
   diferentes, entao o resumo diz as duas para ninguem somar errado. */
function listaPorEspecie(titulo, regex, lista, especies) {
  const donos = lista.filter((c) => (c.animais || []).some((a) => regex.test(a.especie || "")));
  const atend = especies.find((e) => regex.test(e.nome))?.n || 0;
  return {
    type: "lista",
    payload: {
      titulo,
      resumo: `${num(atend)} atendimentos, de ${donos.length} tutores com pet ${titulo.toLowerCase().replace(/s$/, "")}.`,
      itens: [...donos].sort((a, b) => b.fat - a.fat).map(itemTutor),
    },
  };
}

function Clientes({ u, onOpen }) {
  const orig = (u.origem || []).map((o) => ({ nome: o.nome, value: o.valor, hint: num(o.valor) }));
  const racas = u.racas || [];
  const especies = u.especies || [];
  const lista = u.clientes || [];
  return (
    <div className="bento">
      <Kpi
        label="Tutores no recorte"
        value={num(lista.length || u.novos)}
        hint="Clique para ver a lista"
        onOpen={() => onOpen(listaTutores("Tutores no recorte", `${lista.length} tutores com venda no periodo.`, lista))}
      />
      <Kpi
        label="Pacientes (animais)"
        value={num(lista.reduce((a, c) => a + (c.animais?.length || 0), 0))}
        onOpen={() => onOpen(listaPets(lista))}
      />
      <Kpi
        label="Caninos"
        value={num(especies.find((e) => /canin/i.test(e.nome))?.n || 0)}
        onOpen={() => onOpen(listaPorEspecie("Caninos", /canin/i, lista, especies))}
      />
      <Kpi
        label="Felinos"
        value={num(especies.find((e) => /felin/i.test(e.nome))?.n || 0)}
        onOpen={() => onOpen(listaPorEspecie("Felinos", /felin/i, lista, especies))}
      />

      <section className="card span-12">
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
          <h2>Genero do tutor</h2>
          <p>Quem traz o animal na clinica.</p>
        </header>
        <div className="genero">
          {[
            ["fem", "Mulheres", u.genero?.fem || 0],
            ["masc", "Homens", u.genero?.masc || 0],
          ].map(([k, rotulo, n]) => {
            const tot = (u.genero?.fem || 0) + (u.genero?.masc || 0) || 1;
            return (
              <div key={k} className={`genero-${k}`}>
                <strong>{num(n)}</strong>
                <span>{rotulo}</span>
                <div className="track">
                  <i style={{ width: `${Math.round((n / tot) * 100)}%` }} />
                </div>
                <small>{Math.round((n / tot) * 100)}% do total</small>
              </div>
            );
          })}
        </div>
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
          <h2>Contatos</h2>
          <p>Tutor, pet e telefone do recorte. Para ligar ou mandar mensagem.</p>
        </header>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Tutor</th>
                <th>Pets</th>
                <th>Telefone</th>
                <th>Bairro</th>
              </tr>
            </thead>
            <tbody>
              {lista.slice(0, 60).map((c) => (
                <tr key={`ct-${c.codigo || c.nome}`} className="click" onClick={() => onOpen({ type: "cliente", payload: c })}>
                  <td>{c.codigo || "-"}</td>
                  <td>{c.nome}</td>
                  <td>{(c.animais || []).map((a) => a.nome).join(", ") || "-"}</td>
                  <td>{c.celular || "-"}</td>
                  <td>{c.bairro || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {lista.length > 60 ? <p className="hint">Mostrando 60 de {num(lista.length)} no recorte.</p> : null}
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

function Recorrencia({ u, status, onOpen }) {
  const stacked = u.monthlyQtd.map((n, i) => Math.round(n * 0.72));
  const lim = status?.limites || { pre: 9, inativo: 12 };
  return (
    <div className="bento">
      <Kpi
        label="Clientes ativos"
        value={num(status ? status.ativo : u.recorrentes)}
        hint={status ? `Vieram nos ultimos ${lim.pre} meses` : "Sem base historica"}
      />
      <Kpi label="Novos no recorte" value={num(u.novos)} />
      <Kpi
        label="Pre-inativos"
        value={num(status?.pre || 0)}
        hint={`Entre ${lim.pre} e ${lim.inativo} meses sem vir · clique para ligar`}
        warn={!!status?.pre}
        onOpen={
          status?.listaPre?.length
            ? () =>
                onOpen({
                  type: "lista",
                  payload: {
                    titulo: "Pre-inativos",
                    resumo: `${status.pre} clientes entre ${lim.pre} e ${lim.inativo} meses sem vir. Mostrando os ${status.listaPre.length} mais urgentes.`,
                    itens: status.listaPre.map((c) => ({
                      chave: c.nome,
                      nome: c.nome,
                      nota: `ultima visita ${c.ultima} · ${c.meses} meses`,
                      valor: brl(c.fat),
                    })),
                  },
                })
            : undefined
        }
      />
      <Kpi
        label="Inativos"
        value={num(status?.inativo || 0)}
        hint={`Mais de ${lim.inativo} meses sem vir`}
      />
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
      <Kpi
        label="Doses no recorte"
        value={num(total)}
        hint="So o que saiu na venda (nao o estoque)"
        onOpen={() =>
          onOpen({
            type: "lista",
            payload: {
              titulo: "Doses por vacina",
              resumo: `${num(total)} doses no recorte, somando ${top.length} tipos.`,
              itens: [...top]
                .sort((a, b) => (b.n || b.aplicada || 0) - (a.n || a.aplicada || 0))
                .map((v) => ({
                  chave: v.nome,
                  nome: v.nome,
                  nota: `${num(v.n || v.aplicada || 0)} doses`,
                  valor: `${Math.round(((v.n || v.aplicada || 0) / (total || 1)) * 100)}%`,
                  abrir: { type: "vacina", payload: v },
                })),
            },
          })
        }
      />
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
  const temDado = (u.nps?.respostas || 0) > 0;
  return (
    <div className="bento">
      {temDado ? (
        <>
          <Kpi label="NPS" value={u.nps.nota} hint="0 a 10" />
          <Kpi label="Respostas" value={num(u.nps.respostas)} />
        </>
      ) : null}
      <section className="card span-12">
        <header>
          <h2>Pesquisa de satisfacao</h2>
          <p>De onde viria a nota.</p>
        </header>
        {temDado ? (
          <p className="body">
            Comentarios individuais ficam so com a gestao. A TV e o time nao veem texto de tutor.
          </p>
        ) : (
          <div className="tv-vazio">
            <strong>Sem dado de pesquisa</strong>
            <p>
              A pesquisa de satisfacao da clinica roda no <b>Pangeia</b>, um sistema separado. Nosso
              robo le o SimplesVet, e a nota nao passa por la — por isso chega zerada.
            </p>
            <p className="tv-vazio-dica">
              O BI antigo tinha a mesma limitacao: a pagina de satisfacao dele mostrava
              &ldquo;visual indisponivel&rdquo;. Para a nota aparecer aqui, alguem precisa ligar o Pangeia
              (exportacao ou API) ao robo.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function Dre({ u }) {
  const linhas = u.dre || [];
  return (
    <div className="bento">
      <section className="card span-12">
        <header>
          <h2>DRE {u.id === "consolidado" ? "consolidada" : `da ${u.nome.toLowerCase()}`}</h2>
          <p>
            Receita e recebimento vêm do SimplesVet. Pessoal, aluguel e o resto do custo ainda não entram nesse robô — por
            isso aparecem como traço, não como zero.
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
              {linhas.map((row) => (
                <tr key={row.linha} className={row.destaque ? "now" : ""}>
                  <td>{row.linha}</td>
                  <td className={row.valor < 0 ? "down" : ""}>{dreCell(row, "valor")}</td>
                  {u.id === "consolidado" ? (
                    <>
                      <td>{dreCell(row, "matriz")}</td>
                      <td>{dreCell(row, "filial")}</td>
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

function Drawer({ detail, onClose, onOpen }) {
  if (!detail) return null;
  const { type, payload: p } = detail;
  return (
    <div className="drawer-bg" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-topo">
          {detail.voltar ? (
            <button className="drawer-voltar" onClick={() => onOpen?.(detail.voltar)}>
              Voltar para {detail.voltar.payload?.titulo || "a lista"}
            </button>
          ) : (
            <span />
          )}
          <button className="x" onClick={onClose}>
            Fechar
          </button>
        </div>
        {type === "lista" && (
          <>
            <h2>{p.titulo}</h2>
            <p className="hint">{p.resumo}</p>
            <ul className="drawer-lista">
              {p.itens.map((it) => (
                <li key={it.chave}>
                  <button
                    type="button"
                    onClick={() => it.abrir && onOpen?.({ ...it.abrir, voltar: detail })}
                    disabled={!it.abrir}
                  >
                    <span>{it.nome}</span>
                    <small>{it.nota}</small>
                    <b>{it.valor}</b>
                  </button>
                </li>
              ))}
            </ul>
            {p.itens.length >= 200 ? (
              <p className="hint">Mostrando os {p.itens.length} do recorte.</p>
            ) : null}
          </>
        )}
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

function Tv({ u, label, fotos, live }) {
  const equipe = u.equipe || [];
  const total = equipe.reduce((a, p) => a + (p.fat || 0), 0);
  const fonte = live?.ok
    ? `robô ok · ${live.rows} vendas lidas · ${new Date(live.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
    : "robô sem resposta · mostrando o retrato guardado";
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
      <Podium
        equipe={equipe}
        brl={brl}
        fotos={fotos}
        diagnostico={`${u.casa} · ${label} · ${equipe.length} pessoa(s) no recorte · ${fonte}`}
      />
    </div>
  );
}

function Painel({ perfil, aoSair }) {
  /* O menu so mostra o que a conta pode ver. Isto e conveniencia: o filtro
     que vale acontece no servidor, que poda o proprio snapshot. */
  const podeVer = (id) => perfil.paginas === "todas" || (perfil.paginas || []).includes(id);
  const navVisivel = NAV.filter((n) => podeVer(n.id));
  const [page, setPage] = useState(navVisivel[0]?.id || "vendas");
  const [unit, setUnit] = useState("matriz");
  /* Abria sempre em Set/2026 porque ano e mês estavam escritos na mão.
     A tela de vendedor já derivava da data; o painel não. */
  const hoje = hojeBR();
  const [year, setYear] = useState(hoje.getFullYear());
  const [month, setMonth] = useState(hoje.getMonth());
  /* hoje e semana ja vem dentro da mesma resposta do snapshot, entao trocar
     para eles nao custa rede nenhuma. Mes e ano e que mudam a busca. */
  const [periodo, setPeriodo] = useState("mes");
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
  const recorte =
    periodo === "hoje" ? live?.hoje : periodo === "semana" ? live?.semana : live?.view;
  const u = recorte ? { ...demo, ...recorte } : demo;
  const yearsOn = [...new Set([...(live?.years || []), ...(u.compareYears || []).filter((c) => c.qtd || c.fat).map((c) => c.ano), year])].filter(Boolean).sort((a, b) => a - b);
  const label =
    periodo === "hoje"
      ? `Hoje · ${u.diaLabel || ""}`
      : periodo === "semana"
        ? `Semana · ${u.diaLabel || ""}${u.dias ? ` · ${u.dias} dia(s)` : ""}`
        : periodLabel(year, month);
  const fonte = live?.ok
    ? `SimplesVet ${live.rows} vendas · ${new Date(live.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
    : "Aguardando robô";
  const api = import.meta.env.VITE_API_URL || "";
  const [tentativa, setTentativa] = useState(0);
  /* O snapshot e rebuscado a cada troca de unidade/ano/mes. Avisar em toda
     falha viraria enxurrada, entao so avisamos quando o estado VIRA. */
  const ultimoOk = useRef(null);

  /* O robô relê o SimplesVet a cada 2 min (SCRAPE_MS). A tela buscava uma
     vez e congelava: o telão do corredor fica ligado o dia inteiro mostrando
     o número da hora em que alguém abriu a página.
     Pausa quando a aba some, e atualiza na hora em que ela volta. */
  useEffect(() => {
    const PASSO = 120000;
    let id = 0;
    const liga = () => {
      clearInterval(id);
      id = setInterval(() => setTentativa((n) => n + 1), PASSO);
    };
    const aoTrocarVisibilidade = () => {
      if (document.hidden) {
        clearInterval(id);
        return;
      }
      setTentativa((n) => n + 1);
      liga();
    };
    liga();
    document.addEventListener("visibilitychange", aoTrocarVisibilidade);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", aoTrocarVisibilidade);
    };
  }, []);

  /* Cada recorte guardado por chave. Voltar para a Matriz depois de ver a
     Filial passa a ser instantaneo em vez de esperar 84 KB de novo.
     Limite de 12 para o telao, que fica ligado o dia todo, nao virar bolha
     de memoria trocando de mes. */
  const cache = useRef(new Map());
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    let vivo = true;
    const chave = `${unit}|${year}|${month}`;
    const guardado = cache.current.get(chave);
    if (guardado) setLive(guardado);
    /* Sem nada guardado, seguimos mostrando o recorte anterior marcado como
       "atualizando". Zerar aqui faria a tela cair no mock do data.js, que e
       pior que dado velho: seria numero inventado sem aviso. */
    setCarregando(!guardado);

    const q = `${api}/api/snapshot?unit=${unit}&year=${year}&month=${month}`;
    apiFetch(q)
      .then((r) => r.json())
      .then((j) => (j.ok ? j : { ok: false }))
      .catch(() => ({ ok: false }))
      .then((j) => {
        if (!vivo) return;
        if (j.ok) {
          cache.current.set(chave, j);
          if (cache.current.size > 12) cache.current.delete(cache.current.keys().next().value);
        }
        setCarregando(false);
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
          {navVisivel.map((item) => {
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

      <div className="main" data-carregando={carregando ? "1" : undefined} aria-busy={carregando}>
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
          <div className="periodos" role="tablist" aria-label="Recorte">
            {[
              ["hoje", "Hoje"],
              ["semana", "Semana"],
              ["mes", "Mês"],
              ["ano", "Ano"],
            ].map(([id, rotulo]) => (
              <button
                key={id}
                role="tab"
                aria-selected={periodo === id}
                className={periodo === id ? "on" : ""}
                onClick={() => {
                  setPeriodo(id);
                  if (id === "mes") {
                    setYear(hoje.getFullYear());
                    setMonth(hoje.getMonth());
                  }
                  if (id === "ano") setMonth("all");
                }}
              >
                {rotulo}
              </button>
            ))}
          </div>
          <div className="period" hidden={periodo === "hoje" || periodo === "semana"}>
            <CalendarBlank size={16} />
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Ano">
              {yearsOn.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <select
              value={month}
              onChange={(e) => {
                const v = e.target.value === "all" ? "all" : Number(e.target.value);
                setMonth(v);
                setPeriodo(v === "all" ? "ano" : "mes");
              }}
              aria-label="Mes"
            >
              <option value="all">Ano todo</option>
              {MONTHS.map((m, i) => (
                <option key={m} value={i} disabled={year === hoje.getFullYear() && i > hoje.getMonth()}>
                  {m}
                </option>
              ))}
            </select>
            {perfil.admin ? (
              <button
                type="button"
                className="conta-sair"
                onClick={() => setPage(page === "contas" ? navVisivel[0]?.id || "vendas" : "contas")}
              >
                {page === "contas" ? "Voltar ao painel" : "Contas"}
              </button>
            ) : null}
            <button type="button" className="conta-sair" onClick={aoSair} title={perfil.email}>
              Sair
            </button>
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
          <h1>{page === "contas" ? "Contas" : NAV.find((n) => n.id === page)?.label}</h1>
          <div className="crumb-meta">
            <span>
              {u.casa} · {label}
            </span>
            <Badge variant={live?.ok ? "default" : "outline"} className={live?.ok ? "pill-live border-0" : "pill-wait"}>
              {fonte}
            </Badge>
          </div>
        </div>

        {page === "vendas" && <Vendas u={u} year={year} porMes={periodo === "ano" || month === "all"} />}
        {page === "ritmo" && <Ritmo u={u} hoje={live?.hoje} onOpen={setDetail} />}
        {page === "equipe" && <Equipe u={u} onOpen={setDetail} />}
        {page === "clientes" && <Clientes u={u} onOpen={setDetail} />}
        {page === "recorrencia" && <Recorrencia u={u} status={live?.clientesStatus} onOpen={setDetail} />}
        {page === "vacinas" && <Vacinas u={u} onOpen={setDetail} />}
        {page === "pesquisa" && <Pesquisa u={u} />}
        {page === "dre" && <Dre u={u} />}
        {page === "tv" && <Tv u={u} label={label} fotos={live?.fotos} live={live} />}
        {page === "contas" && perfil.admin ? <Contas /> : null}
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
      <Drawer detail={detail} onClose={() => setDetail(null)} onOpen={setDetail} />
      <Toaster position="bottom-right" theme={theme} offset={{ bottom: 20, right: 20 }} />
    </div>
  );
}


/* ---------- Contas e permissoes (so a admin) ---------- */

function Contas() {
  const [perfis, setPerfis] = useState([]);
  const [paginas, setPaginas] = useState([]);
  const [email, setEmail] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = () =>
    apiFetch("/api/perfis")
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) throw new Error(j.error || "nao deu");
        setPerfis(j.perfis);
        setPaginas(j.paginas);
      })
      .catch((e) => setErro(e.message));

  useEffect(() => {
    carregar();
  }, []);

  async function alternar(conta, id) {
    if (conta.paginas === "todas") return;
    const tem = conta.paginas.includes(id);
    const novas = tem ? conta.paginas.filter((x) => x !== id) : [...conta.paginas, id];
    setPerfis((ps) => ps.map((p) => (p.email === conta.email ? { ...p, paginas: novas } : p)));
    const r = await apiFetch("/api/perfis", {
      method: "POST",
      body: JSON.stringify({ email: conta.email, paginas: novas }),
    }).then((x) => x.json());
    if (!r.ok) {
      sileo.error({ title: "Nao salvou", description: r.error });
      carregar();
    }
  }

  async function convidar(e) {
    e.preventDefault();
    setErro("");
    setOcupado(true);
    try {
      const r = await apiFetch("/api/perfis/convidar", {
        method: "POST",
        body: JSON.stringify({ email, paginas: [] }),
      }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error);
      setPerfis(r.perfis);
      setEmail("");
      sileo.success({ title: "Convite enviado", description: `${email} recebe um e-mail para criar a senha.` });
    } catch (e2) {
      setErro(e2.message || "nao deu para convidar");
    } finally {
      setOcupado(false);
    }
  }

  async function remover(conta) {
    const r = await apiFetch("/api/perfis", {
      method: "DELETE",
      body: JSON.stringify({ email: conta.email }),
    }).then((x) => x.json());
    if (r.ok) setPerfis(r.perfis);
    else sileo.error({ title: "Nao removeu", description: r.error });
  }

  return (
    <div className="bento">
      <section className="card span-12">
        <header>
          <h2>Convidar</h2>
          <p>A pessoa recebe um e-mail do Supabase para criar a propria senha. Ela entra sem aba nenhuma ate voce liberar abaixo.</p>
        </header>
        <form className="seller-filters" onSubmit={convidar}>
          <input
            type="email"
            required
            placeholder="email@animalcenter.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ flex: 1, background: "var(--surface-2)", border: "1px solid var(--line)", borderRadius: "var(--r-ctl)", padding: "10px 12px", color: "inherit" }}
          />
          <button type="submit" className="conta-sair" disabled={ocupado || !email}>
            {ocupado ? "Enviando…" : "Convidar"}
          </button>
        </form>
        {erro ? <p className="portao-erro">{erro}</p> : null}
      </section>

      <section className="card span-12">
        <header>
          <h2>Quem ve o que</h2>
          <p>Clique numa aba para liberar ou tirar. O ponto amarelo marca as que mostram dado pessoal de tutor.</p>
        </header>
        <div className="contas">
          {perfis.map((c) => (
            <div key={c.email} className="conta">
              <div className="conta-topo">
                <strong>{c.email}</strong>
                {c.admin ? (
                  <span className="ui-badge ui-badge-solid">admin · ve tudo</span>
                ) : (
                  <button type="button" className="conta-sair" onClick={() => remover(c)}>
                    Remover acesso
                  </button>
                )}
              </div>
              {c.admin ? null : (
                <div className="conta-abas">
                  {paginas.map((pg) => (
                    <button
                      key={pg.id}
                      type="button"
                      className={`${c.paginas.includes(pg.id) ? "on" : ""} ${pg.sensivel ? "sensivel" : ""}`}
                      onClick={() => alternar(c, pg.id)}
                    >
                      {pg.nome}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {!perfis.length ? <p className="hint">Ninguem alem de voce ainda.</p> : null}
        </div>
      </section>
    </div>
  );
}

/* ---------- Portao ----------
   Identidade vem do Supabase. As permissoes vem do servidor, que e quem de
   fato poda o dado — a tela so usa a lista para montar o menu. */

export default function App() {
  const [sessao, setSessao] = useState(undefined);
  const [perfil, setPerfil] = useState(null);
  const [erro, setErro] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!supa) {
      setSessao(null);
      return undefined;
    }
    supa.auth.getSession().then(({ data }) => setSessao(data.session || null));
    const { data: sub } = supa.auth.onAuthStateChange((_e, s) => {
      setSessao(s || null);
      if (!s) setPerfil(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!sessao) return;
    apiFetch("/api/perfil")
      .then((r) => r.json())
      .then((j) => (j.ok ? setPerfil(j.perfil) : setErro(j.error)))
      .catch(() => setErro("nao deu para falar com o servidor"));
  }, [sessao]);

  async function entrar(e) {
    e.preventDefault();
    setErro("");
    setOcupado(true);
    const { error } = await supa.auth.signInWithPassword({ email, password: senha });
    if (error) setErro(error.message === "Invalid login credentials" ? "E-mail ou senha nao conferem." : error.message);
    setOcupado(false);
  }

  const sair = async () => {
    await supa?.auth.signOut();
    setPerfil(null);
  };

  if (!supaConfigurado) {
    return (
      <div className="portao">
        <div className="portao-caixa">
          <h1>Painel sem autenticacao configurada</h1>
          <p>
            Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no build, e SUPABASE_URL no servidor.
            Enquanto isso o painel fica fechado — e o jeito certo de falhar, porque ele carrega
            telefone e endereco de tutor.
          </p>
          <p className="portao-nota">O ranking do corredor segue no ar em /ranking.</p>
        </div>
      </div>
    );
  }

  if (sessao === undefined) return <div className="portao"><p className="hint">Carregando…</p></div>;

  if (!sessao) {
    return (
      <div className="portao">
        <form className="portao-caixa" onSubmit={entrar}>
          <img src="/logo-dark.png" alt="" />
          <h1>Painel da diretoria</h1>
          <p>Acesso restrito. Vendedoras entram em /eu com o PIN.</p>
          {erro ? <p className="portao-erro">{erro}</p> : null}
          <label>
            E-mail
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </label>
          <label>
            Senha
            <input type="password" required value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" />
          </label>
          <button type="submit" disabled={ocupado || !email || !senha}>
            {ocupado ? "Entrando…" : "Entrar"}
          </button>
          <p className="portao-nota">O ranking do corredor nao pede senha: /ranking</p>
        </form>
      </div>
    );
  }

  if (!perfil) return <div className="portao"><p className="hint">{erro || "Conferindo seu acesso…"}</p></div>;

  const semAba = perfil.paginas !== "todas" && !(perfil.paginas || []).length;
  if (semAba) {
    return (
      <div className="portao">
        <div className="portao-caixa">
          <h1>Conta sem aba liberada</h1>
          <p>Sua conta existe, mas ainda nao recebeu nenhuma aba. Peca para a diretoria liberar em Contas.</p>
          <button type="button" className="conta-sair" onClick={sair}>Sair</button>
        </div>
      </div>
    );
  }

  return <Painel perfil={perfil} aoSair={sair} />;
}
