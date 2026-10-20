import { useEffect, useState } from "react";
import { sileo } from "sileo";
import { Crown } from "@phosphor-icons/react/Crown";
import { apiFetch } from "./supa.js";
import { brlc, hojeBR, isoBR } from "./data";
import { Aguarde, DiaCorte, MESES, MESES_LONGOS, useApi } from "./Analises.jsx";

/* Aba Veterinários: os seis rankings do projeto de melhorias, a Coroa de
   Ouro (soma das posições, com peso) e o envio do link de avaliação ao
   tutor. As regras de atribuição estão em bot/analises.js. */

export const formatar = (rk, v) => {
  if (v == null) return "—";
  if (rk.formato === "brl") return brlc(v);
  if (rk.formato === "pct") return `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  if (rk.formato === "int") return v.toLocaleString("pt-BR");
  return v.toLocaleString("pt-BR", { minimumFractionDigits: rk.formato === "nota" ? 1 : 2, maximumFractionDigits: 2 });
};

const EXPLICA = {
  ticket: "Faturamento lançado pelo veterinário ÷ clientes diferentes que ele atendeu.",
  consultasPorCirurgia: "Quantas consultas para sair uma cirurgia do paciente (até a janela de dias). Menor é melhor.",
  examesPorConsulta: "Exames do paciente nos dias seguintes à consulta, por consulta.",
  internacao: "Consultas em que o paciente foi internado logo depois.",
  atendimentos: "Consultas + idas para vacina (sem contar dose).",
  nota: "Média das notas de 0 a 10 dos tutores, com mínimo de avaliações.",
};

function Configuracao({ d, onSalvo }) {
  const [c, setC] = useState(d.config);
  const [salvando, setSalvando] = useState(false);
  useEffect(() => setC(d.config), [d.config]);
  const nomes = [...d.vets.map((v) => v.nome), ...d.fora.map((v) => v.nome)].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const num = (campo) => <input inputMode="numeric" value={c[campo]} onChange={(e) => setC({ ...c, [campo]: e.target.value })} aria-label={campo} />;
  async function salvar() {
    setSalvando(true);
    try {
      const r = await apiFetch("/api/veterinarios/config", { method: "POST", body: JSON.stringify(c) }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error || "não deu");
      sileo.success({ title: "Configuração salva", description: "A classificação já usa os pesos novos." });
      onSalvo();
    } catch (e) {
      sileo.error({ title: "Não salvou", description: e.message });
    } finally {
      setSalvando(false);
    }
  }
  return (
    <section className="card span-12">
      <header>
        <h2>Pesos e regras</h2>
        <p>Só a conta admin muda. Peso 0 tira o ranking da Coroa de Ouro; peso 2 conta em dobro.</p>
      </header>
      <div className="vet-config">
        {d.rankingsDef.map((rk) => (
          <label key={rk.id}>
            {rk.nome}
            <input
              inputMode="decimal"
              value={c.pesos[rk.id]}
              onChange={(e) => setC({ ...c, pesos: { ...c.pesos, [rk.id]: e.target.value } })}
              aria-label={`Peso de ${rk.nome}`}
            />
          </label>
        ))}
        <label>Mínimo de consultas no período {num("minConsultas")}</label>
        <label>Mínimo de avaliações para a nota {num("minAvaliacoes")}</label>
        <label>Janela de exames (dias) {num("janelaExames")}</label>
        <label>Janela de internação (dias) {num("janelaInternacao")}</label>
        <label>Janela de cirurgia (dias) {num("janelaCirurgia")}</label>
      </div>
      <details className="vet-excluir">
        <summary>Quem fica fora do ranking ({c.excluir.length})</summary>
        <div>
          {nomes.map((n) => (
            <label key={n}>
              <input
                type="checkbox"
                checked={c.excluir.includes(n)}
                onChange={(e) => setC({ ...c, excluir: e.target.checked ? [...c.excluir, n] : c.excluir.filter((x) => x !== n) })}
              />
              {n}
            </label>
          ))}
        </div>
      </details>
      <button type="button" className="vet-salvar" disabled={salvando} onClick={salvar}>
        {salvando ? "Salvando…" : "Salvar"}
      </button>
    </section>
  );
}

/* A recepção manda o link pelo WhatsApp do próprio computador. A janela
   abre no clique (senão o navegador bloqueia) e recebe o endereço depois. */
function PedirAvaliacao({ unit }) {
  const [dia, setDia] = useState(isoBR(hojeBR()));
  const [versao, setVersao] = useState(0);
  const { d, erro } = useApi(`/api/avaliacoes/consultas?unit=${unit}&dia=${dia}&v=${versao}`);
  async function enviar(c) {
    const janela = window.open("", "_blank");
    try {
      const r = await apiFetch("/api/avaliacoes/link", {
        method: "POST",
        body: JSON.stringify({ funcionario: c.funcionario, unit: c.unit, dia: c.dia, codigo: c.codigo, animal: c.animal }),
      }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error || "não deu");
      const fone = String(c.celular || "").replace(/\D/g, "");
      const numero = fone.length >= 12 ? fone : `55${fone}`;
      const primeiro = String(c.cliente || "").split(/\s+/)[0];
      const texto = `Olá${primeiro ? `, ${primeiro}` : ""}! Aqui é da Animal Center. Como foi o atendimento ${c.animal ? `do(a) ${c.animal} ` : ""}hoje? Sua nota de 0 a 10 leva menos de um minuto: ${r.url}`;
      if (fone && janela) janela.location.href = `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
      else {
        janela?.close();
        await navigator.clipboard?.writeText(r.url).catch(() => {});
        sileo.info({ title: "Sem celular no cadastro", description: "O link foi copiado; mande pelo meio que preferir." });
      }
      setVersao((v) => v + 1);
    } catch (e) {
      janela?.close();
      sileo.error({ title: "Não gerou o link", description: e.message });
    }
  }
  return (
    <section className="card span-12">
      <header>
        <h2>Pedir avaliação ao tutor</h2>
        <p>
          As consultas do dia. "WhatsApp" abre a conversa com o tutor com a mensagem e o link prontos; o tutor dá a nota de 0 a 10 sem precisar
          de login. Cada consulta tem um link só, que vale uma resposta.
        </p>
      </header>
      <div className="an-filtro">
        <label className="an-campo">
          Dia
          <input type="date" value={dia} max={isoBR(hojeBR())} onChange={(e) => e.target.value && setDia(e.target.value)} />
        </label>
      </div>
      {!d ? (
        <p className="hint">{erro ? `Não carregou: ${erro}` : "Montando…"}</p>
      ) : !d.consultas.length ? (
        <p className="hint">Nenhuma consulta neste dia.</p>
      ) : (
        <div className="table-wrap">
          <table className="an-tabela">
            <thead>
              <tr>
                <th>Hora</th>
                <th>Veterinário</th>
                <th>Tutor</th>
                <th>Paciente</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {d.consultas.map((c) => (
                <tr key={`${c.funcionario}|${c.codigo}|${c.animal}`}>
                  <td>{c.hora == null ? "—" : `${String(c.hora).padStart(2, "0")}h`}</td>
                  <td>{c.funcionario}</td>
                  <td>{c.cliente}</td>
                  <td>{c.animal}</td>
                  <td className="vet-acao">
                    {c.respondida ? (
                      <span className="vet-ok">respondeu</span>
                    ) : (
                      <button type="button" onClick={() => enviar(c)}>
                        {c.link ? "Mandar de novo" : "WhatsApp"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function Veterinarios({ unit }) {
  const hoje = hojeBR();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [mes, setMes] = useState(String(hoje.getMonth()));
  const [dia, setDia] = useState("");
  const [versao, setVersao] = useState(0);
  const { d, erro } = useApi(`/api/veterinarios?unit=${unit}&ano=${ano}&mes=${mes}${dia ? `&dia=${dia}` : ""}&v=${versao}`);
  const anos = Array.from({ length: hoje.getFullYear() - 2023 + 1 }, (_, i) => 2023 + i);
  const periodo = mes === "all" ? String(ano) : `${MESES_LONGOS[Number(mes)]}/${ano}`;

  const filtro = (
    <div className="an-filtro">
      <label className="an-campo">
        Mês
        <select value={mes} onChange={(e) => setMes(e.target.value)}>
          <option value="all">ano inteiro</option>
          {MESES.map((nome, m) => (
            <option key={nome} value={String(m)}>
              {MESES_LONGOS[m]}
            </option>
          ))}
        </select>
      </label>
      <label className="an-campo">
        Ano
        <select value={ano} onChange={(e) => setAno(Number(e.target.value))}>
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>
      <DiaCorte dia={dia} onChange={setDia} />
      <a className="vet-tv" href="/tv" target="_blank" rel="noreferrer">
        Abrir a página da TV
      </a>
    </div>
  );

  if (!d) {
    return (
      <div className="bento">
        <section className="card span-12">
          <header>
            <h2>Veterinários</h2>
          </header>
          {filtro}
        </section>
        <Aguarde titulo="Classificação" erro={erro} />
      </div>
    );
  }
  const top = d.vets.slice(0, 3);

  return (
    <div className="bento">
      <section className="card span-12">
        <header>
          <h2>Coroa de Ouro · {periodo}</h2>
          <p>
            Soma das posições nos seis rankings, cada uma multiplicada pelo seu peso. Menos pontos, melhor. Entra quem teve pelo menos{" "}
            {d.config.minConsultas} consultas no período{dia ? `, até o dia ${dia}` : ""}.
          </p>
        </header>
        {filtro}
        {!d.vets.length ? (
          <p className="hint">Ninguém com consultas suficientes no período.</p>
        ) : (
          <>
            <div className="vet-podio">
              {top.map((v) => (
                <div key={v.nome} className={`vet-lugar l${v.coroa}`}>
                  {v.coroa === 1 ? <Crown size={40} weight="fill" className="vet-coroa" /> : <span className="vet-pos">{v.coroa}º</span>}
                  <strong>{v.nome}</strong>
                  <small>
                    {v.casa} · {v.pontos.toLocaleString("pt-BR")} pontos
                  </small>
                </div>
              ))}
            </div>
            <div className="table-wrap">
              <table className="an-tabela">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Veterinário</th>
                    <th className="num">Pontos</th>
                    {d.rankingsDef.map((rk) => (
                      <th key={rk.id} className="num" title={EXPLICA[rk.id]}>
                        {rk.nome}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.vets.map((v) => (
                    <tr key={v.nome} className={v.coroa === 1 ? "an-agora" : ""}>
                      <td>{v.coroa}</td>
                      <td>
                        {v.nome}
                        <small className="vet-casa"> {v.casa}</small>
                      </td>
                      <td className="num">{v.pontos.toLocaleString("pt-BR")}</td>
                      {d.rankingsDef.map((rk) => (
                        <td key={rk.id} className="num">
                          {formatar(rk, v[rk.id])}
                          <small className="vet-p"> {v.posicoes[rk.id]}º</small>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {d.rankingsDef.map((rk) => {
        const lista = d.rankings[rk.id].map((nome) => d.vets.find((v) => v.nome === nome));
        const sem = d.vets.filter((v) => v[rk.id] == null);
        return (
          <section key={rk.id} className="card span-4 vet-ranking">
            <header>
              <h2>{rk.nome}</h2>
              <p>{EXPLICA[rk.id]}</p>
            </header>
            <ol>
              {lista.map((v) => (
                <li key={v.nome}>
                  <span>{v.nome}</span>
                  <b>{formatar(rk, v[rk.id])}</b>
                  {rk.id === "nota" ? <small> {v.avaliacoes} aval.</small> : null}
                  {rk.id === "consultasPorCirurgia" ? <small> {v.cirurgias} cir.</small> : null}
                  {rk.id === "internacao" ? (
                    <small>
                      {" "}
                      {v.internacoes} de {v.consultas}
                    </small>
                  ) : null}
                </li>
              ))}
            </ol>
            {sem.length ? (
              <p className="hint">
                Sem valor: {sem.map((v) => v.nome).join(", ")}
                {rk.id === "nota" ? ` (menos de ${d.config.minAvaliacoes} avaliações)` : ""}.
              </p>
            ) : null}
          </section>
        );
      })}

      {d.fora.length ? (
        <section className="card span-12">
          <header>
            <h2>Fora da classificação</h2>
            <p>Lançaram consulta no período, mas abaixo do mínimo de {d.config.minConsultas} ou tirados pela administração.</p>
          </header>
          <p className="vet-fora">{d.fora.map((v) => `${v.nome} (${v.consultas}${v.excluido ? ", tirado" : ""})`).join(" · ")}</p>
        </section>
      ) : null}

      <PedirAvaliacao unit={unit} />
      {d.podeEditar ? <Configuracao d={d} onSalvo={() => setVersao((v) => v + 1)} /> : null}
    </div>
  );
}
