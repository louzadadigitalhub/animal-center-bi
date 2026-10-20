import { useEffect, useState } from "react";
import { Crown } from "@phosphor-icons/react/Crown";
import { CornersOut } from "@phosphor-icons/react/CornersOut";
import { MESES_LONGOS } from "./Analises.jsx";
import { formatar } from "./Veterinarios.jsx";

/* Páginas sem login. Nada de valor em reais nem dado de tutor: a TV mostra
   só posição e indicadores de atendimento; a avaliação, o primeiro nome
   de quem atendeu. */

export function TvVets() {
  const [d, setD] = useState(null);
  const [erro, setErro] = useState("");
  const [agora, setAgora] = useState(new Date());
  useEffect(() => {
    const carregar = () =>
      fetch("/api/tv")
        .then((r) => r.json())
        .then((j) => {
          if (!j.ok) throw new Error(j.error || "sem dados");
          setD(j);
          setErro("");
        })
        .catch((e) => setErro(e.message));
    carregar();
    const t = setInterval(carregar, 5 * 60 * 1000);
    const relogio = setInterval(() => setAgora(new Date()), 30 * 1000);
    return () => {
      clearInterval(t);
      clearInterval(relogio);
    };
  }, []);
  const telaCheia = () => document.documentElement.requestFullscreen?.().catch(() => {});
  const hora = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

  if (!d) {
    return (
      <main className="tv-vets">
        <h1>Coroa de Ouro</h1>
        <p className="tv-aviso">{erro ? `Sem dados agora (${erro}). Tenta de novo em 5 minutos.` : "Carregando…"}</p>
      </main>
    );
  }
  const [primeiro, ...resto] = d.vets;
  /* O ticket é em reais: na TV só aparece a posição. */
  const paineis = d.rankingsDef.filter((rk) => rk.id !== "ticket");
  return (
    <main className="tv-vets">
      <header className="tv-topo">
        <h1>
          Coroa de Ouro · {MESES_LONGOS[d.mes]} de {d.ano}
        </h1>
        <span className="tv-hora">{hora}</span>
        <button type="button" onClick={telaCheia} aria-label="Tela cheia">
          <CornersOut size={28} />
        </button>
      </header>
      {!primeiro ? (
        <p className="tv-aviso">Ainda não há veterinário com consultas suficientes neste mês.</p>
      ) : (
        <div className="tv-corpo">
          <section className="tv-campeao">
            <Crown size={96} weight="fill" className="tv-coroa" />
            <strong>{primeiro.nome}</strong>
            <span>{primeiro.casa}</span>
          </section>
          <ol className="tv-lista" start={2}>
            {resto.map((v) => (
              <li key={v.nome}>
                <b>{v.coroa}º</b>
                <span>{v.nome}</span>
                <small>{v.casa}</small>
              </li>
            ))}
          </ol>
          <div className="tv-paineis">
            {paineis.map((rk) => {
              const lista = [...d.vets]
                .filter((v) => v[rk.id] != null)
                .sort((a, b) => a.posicoes[rk.id] - b.posicoes[rk.id])
                .slice(0, 3);
              return (
                <section key={rk.id}>
                  <h2>{rk.nome}</h2>
                  {!lista.length ? <p className="tv-sem">{rk.id === "nota" ? "Ainda sem avaliações suficientes." : "Sem dados no mês."}</p> : null}
                  <ol>
                    {lista.map((v) => (
                      <li key={v.nome}>
                        <span>{v.nome}</span>
                        <b>{formatar(rk, v[rk.id])}</b>
                      </li>
                    ))}
                  </ol>
                </section>
              );
            })}
          </div>
        </div>
      )}
      <footer className="tv-rodape">
        Atualiza sozinho a cada 5 minutos · {new Date(d.atualizadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
      </footer>
    </main>
  );
}

export function Avaliar({ token }) {
  const [info, setInfo] = useState(null);
  const [erro, setErro] = useState("");
  const [nota, setNota] = useState(null);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [feito, setFeito] = useState(false);
  useEffect(() => {
    fetch(`/api/avaliar/${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) throw new Error(j.error || "link inválido");
        setInfo(j);
      })
      .catch((e) => setErro(e.message === "link invalido" ? "Este link não vale mais." : e.message));
  }, [token]);

  async function enviar() {
    if (nota == null) return;
    setEnviando(true);
    try {
      const r = await fetch(`/api/avaliar/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nota, comentario }),
      }).then((x) => x.json());
      if (!r.ok) throw new Error(r.error === "ja respondida" ? "Esta avaliação já foi respondida. Obrigado!" : r.error || "não deu");
      setFeito(true);
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="avaliar">
      <div className="avaliar-cartao">
        <img src="/logo-dark.png" alt="" width="48" height="48" />
        {erro ? (
          <p>{erro}</p>
        ) : !info ? (
          <p>Carregando…</p>
        ) : feito || info.respondida ? (
          <>
            <h1>Obrigado!</h1>
            <p>Sua avaliação ajuda a {info.clinica} a cuidar cada vez melhor.</p>
          </>
        ) : (
          <>
            <h1>Como foi o atendimento?</h1>
            <p>
              De 0 a 10, quanto você recomendaria o atendimento de {info.profissional} na {info.clinica}?
            </p>
            <div className="avaliar-notas" role="radiogroup" aria-label="Nota de 0 a 10">
              {Array.from({ length: 11 }, (_, n) => (
                <button key={n} type="button" role="radio" aria-checked={nota === n} className={nota === n ? "on" : ""} onClick={() => setNota(n)}>
                  {n}
                </button>
              ))}
            </div>
            <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={500} rows={3} placeholder="Quer contar mais alguma coisa? (opcional)" />
            <button type="button" className="avaliar-enviar" disabled={nota == null || enviando} onClick={enviar}>
              {enviando ? "Enviando…" : "Enviar"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
