import { CaretRight } from "@phosphor-icons/react/CaretRight";
import { Donut, SparkBars } from "./charts";
import { brl, brlc, num } from "./data";
import { Num } from "./anim.jsx";

/* Painel: a primeira tela, como a do painel de referencia. Nao tem numero novo:
   cada valor aqui e o mesmo campo do snapshot que a aba de origem mostra,
   e cada cartao leva para ela. */

const GRUPO_NOME = { Plantao: "Plantão", Farmacia: "Farmácia" };

function Indicador({ rotulo, valor, formato, dica, serie, alerta, heroi, ir }) {
  return (
    <button type="button" className={`vg-kpi${alerta ? " is-alerta" : ""}${heroi ? " is-heroi" : ""}`} onClick={ir}>
      <span className="vg-rotulo">{rotulo}</span>
      <strong className="vg-valor">
        <Num value={valor || 0} format={formato} />
      </strong>
      {dica ? <span className="vg-dica">{dica}</span> : null}
      {serie ? <SparkBars values={serie} /> : null}
      <CaretRight className="vg-ir" size={14} aria-hidden />
    </button>
  );
}

/* Meio anel da meta, como o medidor de meta do painel de referencia. */
function Medidor({ pct }) {
  const p = Math.max(0, Math.min(100, pct || 0));
  const real = Math.round(pct || 0);
  const r = 70;
  const meia = Math.PI * r;
  return (
    <svg className="vg-medidor" viewBox="0 0 180 104" role="img" aria-label={`${real}% da meta`}>
      <path className="vg-medidor-trilho" d="M20 94 A70 70 0 0 1 160 94" />
      {/* Com 0% a ponta redonda desenhava um ponto solto: sem arco. */}
      {p > 0 ? (
        <path
          className="vg-medidor-arco"
          d="M20 94 A70 70 0 0 1 160 94"
          style={{ strokeDasharray: `${(p / 100) * meia} ${meia}` }}
        />
      ) : null}
    </svg>
  );
}

export default function Visao({ u, podeVer, onIr, rotulo }) {
  /* Mesmas contas da aba Vendas (App.jsx), inclusive a reserva quando o
     snapshot vem sem o bloco de caixa. */
  const cx = u.caixa || {
    receitaTotal: u.fat,
    emAberto: Math.max(0, (u.fatVenda || 0) - (u.fat || 0)),
  };
  const receita = cx.receitaTotalExata != null ? cx.receitaTotalExata : cx.receitaTotal || u.fat;
  const formatoReceita = cx.receitaTotalExata != null ? brlc : brl;
  const serie = (u.monthlyFat || []).map((n) => n || 0);
  const grupos = [...(u.grupos || [])].filter((g) => g.valor).sort((a, b) => b.valor - a.valor);
  const maxG = Math.max(1, ...grupos.map((g) => g.valor));
  // contado em todos os grupos, como em Vendas (grupo zerado abaixo da media tambem conta)
  const abaixo = (u.grupos || []).filter((g) => g.media != null && g.valor < g.media);
  const equipe = podeVer("equipe") ? [...(u.equipe || [])].sort((a, b) => (b.fat || 0) - (a.fat || 0)).slice(0, 5) : [];
  const maxE = Math.max(1, ...equipe.map((p) => p.fat || 0));
  const clientes = [
    { nome: "Novos", value: u.novos || 0, hint: num(u.novos || 0) },
    { nome: "Recorrentes", value: u.recorrentes || 0, hint: num(u.recorrentes || 0) },
  ];
  const vaiVendas = () => onIr("vendas");
  /* Cada cartao so aparece para quem tem a aba de onde o campo vem: o
     servidor poda o snapshot por aba (bot/acesso.js, CAMPOS) e, sem o
     campo, a tela cairia no numero de exemplo do data.js. */
  const temRitmo = podeVer("ritmo");
  const temVacinas = podeVer("vacinas") || temRitmo;
  const temClientes = podeVer("recorrencia");

  return (
    <div className="vg">
      <div className="vg-kpis">
        <Indicador
          heroi
          rotulo="Receita total"
          valor={receita}
          formato={formatoReceita}
          dica={u.receitaFonte?.origem === "recebimentos" ? "Pelo card de Recebimentos do SimplesVet" : "Soma das baixas do período"}
          serie={serie}
          ir={vaiVendas}
        />
        <Indicador rotulo="Vendas" valor={u.qtd} formato={num} dica={`${brl(u.ticketVenda || 0)} por venda`} ir={vaiVendas} />
        <Indicador rotulo="Valor médio por cliente" valor={u.ticketCliente} formato={brl} dica="Ticket por cliente no recorte" ir={vaiVendas} />
        <Indicador rotulo="Em aberto" valor={cx.emAberto} formato={brl} dica="Vendido e ainda não baixado no caixa" ir={vaiVendas} />
      </div>

      {temRitmo || temVacinas ? (
        <div className="vg-kpis">
          {temRitmo ? (
            <Indicador
              rotulo="Atendimentos"
              valor={u.atendimentos}
              formato={num}
              dica={`${num(u.consultas || 0)} consultas + ${num(u.vacinasAplicadas || 0)} vacinas, no recorte`}
              ir={() => onIr("ritmo")}
            />
          ) : null}
          {temVacinas ? (
            <Indicador
              rotulo="Vacinas aplicadas"
              valor={u.vacinasAplicadas}
              formato={num}
              dica="Doses no recorte"
              ir={() => onIr(podeVer("vacinas") ? "vacinas" : "ritmo")}
            />
          ) : null}
          {temRitmo ? (
            <Indicador rotulo="Internações" valor={u.internacao} formato={num} dica="Itens lançados no recorte; o de hoje fica em Ritmo do dia" ir={() => onIr("ritmo")} />
          ) : null}
          {temRitmo ? (
            <Indicador rotulo="Exames" valor={u.examesQtd} formato={num} dica="Itens lançados no recorte; o de hoje fica em Ritmo do dia" ir={() => onIr("ritmo")} />
          ) : null}
        </div>
      ) : null}

      <div className="vg-grade">
        <section className="card vg-cartao">
          <header>
            <h2>Cirurgias eletivas · meta</h2>
            <p>{rotulo}</p>
          </header>
          <div className="vg-meta">
            <Medidor pct={u.eletivasPct} />
            <strong className="vg-meta-pct">
              <Num value={u.eletivasPct || 0} format={(n) => `${Math.round(n)}%`} />
            </strong>
          </div>
          <p className="vg-meta-nota">
            {num(u.eletivas || 0)} de {num(u.metaEletivas || 0)} eletivas da meta
          </p>
        </section>

        {temClientes ? (
        <section className="card vg-cartao">
          <header>
            <h2>Clientes no período</h2>
            <p>Primeira compra da vida no recorte contra quem já era cliente</p>
          </header>
          <Donut slices={clientes} totalLabel="Clientes" totalValue={num((u.novos || 0) + (u.recorrentes || 0))} />
          <button type="button" className="vg-link" onClick={() => onIr("recorrencia")}>
            Ver recorrência <CaretRight size={12} aria-hidden />
          </button>
        </section>
        ) : null}

        <section className="card vg-cartao">
          <header>
            <h2>Faturamento por grupo</h2>
            <p>{abaixo.length ? `${abaixo.length} abaixo da média do ano` : "Participação no recorte"}</p>
          </header>
          {!grupos.length ? <p className="hint">Sem venda neste recorte.</p> : null}
          <ul className="vg-barras">
            {grupos.slice(0, 7).map((g) => (
              <li key={g.nome} className={g.media != null && g.valor < g.media ? "is-abaixo" : ""}>
                <span>{GRUPO_NOME[g.nome] || g.nome}</span>
                <i style={{ "--w": `${(g.valor / maxG) * 100}%` }} />
                <b>{brl(g.valor)}</b>
              </li>
            ))}
          </ul>
          <button type="button" className="vg-link" onClick={vaiVendas}>
            Abrir Vendas <CaretRight size={12} aria-hidden />
          </button>
        </section>

        {equipe.length ? (
          <section className="card vg-cartao">
            <header>
              <h2>Quem mais faturou</h2>
              <p>Cinco primeiros da equipe no recorte</p>
            </header>
            <ol className="vg-equipe">
              {equipe.map((p, i) => (
                <li key={p.nome}>
                  <span className="vg-pos">{i + 1}</span>
                  <span className="vg-nome">{p.nome}</span>
                  <b>{brl(p.fat || 0)}</b>
                  <i style={{ "--w": `${((p.fat || 0) / maxE) * 100}%` }} />
                </li>
              ))}
            </ol>
            <button type="button" className="vg-link" onClick={() => onIr("equipe")}>
              Abrir Equipe <CaretRight size={12} aria-hidden />
            </button>
          </section>
        ) : null}
      </div>
    </div>
  );
}
