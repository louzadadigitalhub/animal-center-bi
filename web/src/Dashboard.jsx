import { useCallback, useEffect, useRef, useState } from "react";
import { sileo } from "sileo";
import { apiFetch } from "./supa.js";
import { brlc, hojeBR } from "./data";

/* A "DASHBOARD ANÁLISE ESTRATÉGICA" da planilha de análise financeira,
   com a mesma cara: meses em colunas, valor e % do faturamento lado a
   lado, as mesmas linhas e as mesmas cores. Os números vêm do robô; só o
   pró-labore, o pró-labore "justo" e o relatório do mês são digitados. */

const NOMES = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
const CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const EDITAVEIS = new Set(["prolabore", "justo"]);

const chaveDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const rotulo = (chave) => `${CURTOS[Number(chave.slice(5)) - 1]}/${chave.slice(0, 4)}`;
const pct = (v, fat) =>
  v == null || !fat ? "" : `${((v / fat) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

function SeletorMes({ rotuloCampo, valor, onChange, anos }) {
  const [a, m] = valor.split("-");
  return (
    <label>
      {rotuloCampo}
      <select value={m} onChange={(e) => onChange(`${a}-${e.target.value}`)} aria-label={`${rotuloCampo}: mês`}>
        {CURTOS.map((nome, i) => (
          <option key={nome} value={String(i + 1).padStart(2, "0")}>
            {nome}
          </option>
        ))}
      </select>
      <select value={a} onChange={(e) => onChange(`${e.target.value}-${m}`)} aria-label={`${rotuloCampo}: ano`}>
        {anos.map((ano) => (
          <option key={ano} value={ano}>
            {ano}
          </option>
        ))}
      </select>
    </label>
  );
}

function CelulaEditavel({ valor, auto, titulo, onSalvar }) {
  const [aberta, setAberta] = useState(false);
  const [texto, setTexto] = useState("");
  if (aberta) {
    const fechar = () => setAberta(false);
    const salvar = async () => {
      const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
      if (limpo && !Number.isFinite(Number(limpo))) {
        sileo.error({ title: "Valor inválido", description: "Use só números, como 98000 ou 98.000,00." });
        return;
      }
      if (await onSalvar(limpo === "" ? null : Number(limpo))) fechar();
    };
    return (
      <input
        className="planilha-input"
        autoFocus
        inputMode="decimal"
        value={texto}
        placeholder="vazio = automático"
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") salvar();
          if (e.key === "Escape") fechar();
        }}
        onBlur={fechar}
        aria-label={titulo}
      />
    );
  }
  return (
    <button
      type="button"
      className={`planilha-editar ${auto ? "auto" : ""}`}
      title={titulo}
      onClick={() => {
        setTexto(valor == null ? "" : String(valor).replace(".", ","));
        setAberta(true);
      }}
    >
      {valor == null ? "—" : brlc(valor)}
    </button>
  );
}

function Relatorio({ notas, colunas, podeEditar, onSalvar }) {
  const ultima = colunas[colunas.length - 1]?.chave || "";
  const [mes, setMes] = useState(ultima);
  const [texto, setTexto] = useState(notas[ultima] || "");
  const [salvando, setSalvando] = useState(false);
  const comNota = colunas.filter((c) => notas[c.chave]);
  if (!podeEditar && !comNota.length) return null;
  return (
    <section className="card span-12 planilha-relatorio">
      <header>
        <h2>Relatório da análise</h2>
        <p>O que a diretoria anotou em cada mês, como embaixo da planilha.</p>
      </header>
      {comNota.length ? (
        <div className="relatorio-meses">
          {comNota.map((c) => (
            <article key={c.chave}>
              <h3>{NOMES[Number(c.chave.slice(5)) - 1]} {c.chave.slice(0, 4)}</h3>
              <p>{notas[c.chave]}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="relatorio-vazio">Nenhum mês do recorte tem relatório ainda.</p>
      )}
      {podeEditar ? (
        <form
          className="relatorio-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setSalvando(true);
            await onSalvar(mes, texto.trim() || null);
            setSalvando(false);
          }}
        >
          <label>
            Mês
            <select
              value={mes}
              onChange={(e) => {
                setMes(e.target.value);
                setTexto(notas[e.target.value] || "");
              }}
            >
              {colunas.map((c) => (
                <option key={c.chave} value={c.chave}>
                  {rotulo(c.chave)}
                </option>
              ))}
            </select>
          </label>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={4} maxLength={4000} placeholder="Relatório do mês (vazio apaga)" />
          <button type="submit" disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar relatório"}
          </button>
        </form>
      ) : null}
    </section>
  );
}

export default function Dashboard() {
  const hoje = hojeBR();
  const atual = chaveDe(hoje);
  const anos = Array.from({ length: hoje.getFullYear() - 2023 + 1 }, (_, i) => String(2023 + i));
  const [de, setDe] = useState("2025-02");
  const [ate, setAte] = useState(atual);
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  const [justo, setJusto] = useState("");
  const rolagem = useRef(null);

  const carregar = useCallback(
    () =>
      apiFetch(`/api/dashboard?de=${de}&ate=${ate}`)
        .then((r) => r.json())
        .then((j) => {
          if (!j.ok) throw new Error(j.error || "não deu");
          setD(j);
          setErro("");
        })
        .catch((e) => setErro(e.message)),
    [de, ate]
  );
  useEffect(() => {
    carregar();
  }, [carregar]);

  /* Como na planilha aberta no mês corrente: o fim fica à vista. */
  useEffect(() => {
    if (rolagem.current) rolagem.current.scrollLeft = rolagem.current.scrollWidth;
  }, [d?.de, d?.ate]);

  async function salvar(campo, chave, valor) {
    try {
      const r = await apiFetch("/api/dashboard/ajuste", {
        method: "POST",
        body: JSON.stringify({ campo, chave, valor }),
      }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error || "não deu");
      await carregar();
      return true;
    } catch (e) {
      sileo.error({ title: "Não salvou", description: e.message });
      return false;
    }
  }

  if (erro && !d) {
    return (
      <div className="bento">
        <section className="card span-12">
          <header>
            <h2>Dashboard</h2>
            <p>Não carregou: {erro}</p>
          </header>
        </section>
      </div>
    );
  }
  if (!d) {
    return (
      <div className="bento">
        <section className="card span-12">
          <header>
            <h2>Dashboard</h2>
            <p>Montando a planilha…</p>
          </header>
        </section>
      </div>
    );
  }

  /* Cabeçalho de anos: um bloco por ano, como a linha 1 da planilha. */
  const blocosAno = [];
  for (const c of d.colunas) {
    const ano = c.chave.slice(0, 4);
    const ult = blocosAno[blocosAno.length - 1];
    if (ult?.ano === ano) ult.n += 1;
    else blocosAno.push({ ano, n: 1 });
  }

  return (
    <div className="bento">
      <section className="card span-12 planilha-card">
        <header>
          <h2>Dashboard · análise estratégica</h2>
          <p>
            As duas unidades somadas, mês a mês, com o % de cada linha sobre o faturamento. Os números vêm do SimplesVet a cada ciclo do
            robô.
          </p>
        </header>
        <div className="planilha-filtro">
          <SeletorMes rotuloCampo="De" valor={de} onChange={setDe} anos={anos} />
          <SeletorMes rotuloCampo="Até" valor={ate} onChange={setAte} anos={anos} />
          {d.podeEditar ? (
            <form
              className="planilha-justo"
              onSubmit={async (e) => {
                e.preventDefault();
                const n = Number(String(justo).replace(/\./g, "").replace(",", "."));
                if (!justo || !Number.isFinite(n)) return;
                if (await salvar("justo", "padrao", n)) setJusto("");
              }}
            >
              <label>
                Pró-labore "justo" padrão
                <input inputMode="decimal" value={justo} placeholder={brlc(d.justoPadrao)} onChange={(e) => setJusto(e.target.value)} />
              </label>
              <button type="submit">Salvar</button>
            </form>
          ) : null}
        </div>

        <div className="planilha-rolagem" ref={rolagem}>
          <table className="planilha">
            <thead>
              <tr className="planilha-anos">
                <th />
                {blocosAno.map((b) => (
                  <th key={b.ano} colSpan={b.n * 2}>
                    {b.ano}
                  </th>
                ))}
              </tr>
              <tr className="planilha-meses">
                <th>DESCRIÇÃO</th>
                {d.colunas.map((c) => (
                  <th key={c.chave} colSpan={2}>
                    {NOMES[Number(c.chave.slice(5)) - 1]}
                    {c.estagio === "em curso" ? <small> em curso</small> : null}
                    {c.semDemonstrativo ? <small> sem DRE</small> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.linhas.map((l) => (
                <tr key={l.id} className={l.cor ? `l-${l.cor}` : ""}>
                  <th scope="row">{l.nome}</th>
                  {d.colunas.map((c) => {
                    const v = c.valores[l.id];
                    const fat = c.valores.fat;
                    const auto = l.id === "prolabore" && c.origem.prolabore === "conta";
                    const semCard = l.id === "fat" && c.origem.fat === "baixas";
                    let conteudo = v == null ? "—" : brlc(v);
                    if (d.podeEditar && EDITAVEIS.has(l.id) && !c.semDemonstrativo) {
                      conteudo = (
                        <CelulaEditavel
                          valor={v}
                          auto={auto}
                          titulo={
                            l.id === "prolabore"
                              ? auto
                                ? `${rotulo(c.chave)}: conta Despesas administrativas. Clique para digitar o pró-labore do mês.`
                                : `${rotulo(c.chave)}: digitado. Apague para voltar à conta Despesas administrativas.`
                              : `${rotulo(c.chave)}: pró-labore "justo". Vazio volta ao padrão.`
                          }
                          onSalvar={(novo) => salvar(l.id, c.chave, novo)}
                        />
                      );
                    }
                    return [
                      <td
                        key={`${c.chave}-v`}
                        className={`v ${auto && !d.podeEditar ? "auto" : ""} ${semCard ? "sem-card" : ""}`}
                        title={semCard ? "Sem o card Receita total do mês: soma das baixas" : auto ? "Conta Despesas administrativas" : undefined}
                      >
                        {conteudo}
                      </td>,
                      <td key={`${c.chave}-p`} className="p">
                        {l.id === "fat" ? "%" : pct(v, fat)}
                      </td>,
                    ];
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="planilha-nota">
          Pró-labore em itálico: nada foi digitado para o mês e vale a conta Despesas administrativas do SimplesVet. Investimentos não incluem o
          pagamento de empréstimos, que tem linha própria. Taxa de antecipação e devoluções ficam fora, como na planilha.
        </p>
      </section>

      <Relatorio
        key={`${d.de}-${d.ate}`}
        notas={d.notas || {}}
        colunas={d.colunas}
        podeEditar={d.podeEditar}
        onSalvar={(chave, texto) => salvar("nota", chave, texto)}
      />
    </div>
  );
}
