/* Telao do corredor: sem login, e por isso alimentado por /api/ranking, que
   nao carrega nada de tutor. Se ele usasse /api/snapshot, trancar o painel
   nao adiantaria — a URL aberta entregaria telefone e endereco do mesmo jeito.
   Sem login o servidor nao manda valor em reais (TV publica sem dinheiro):
   o telao mostra vendas. apiFetch leva o token se quem abriu e da diretoria,
   e ai o faturamento volta. */
import { useEffect, useState } from "react";
import Podium, { Ambient } from "./Podium.jsx";
import { Num } from "./anim.jsx";
import { apiFetch } from "./supa.js";
import "./index.css";

const brl = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const inteiro = (n) => Math.round(Number(n) || 0).toLocaleString("pt-BR");

export default function RankingPublico() {
  const p = new URLSearchParams(window.location.search);
  const unit = p.get("unit") || "matriz";
  const periodo = p.get("periodo") || "mes";
  const [dados, setDados] = useState(null);

  useEffect(() => {
    let vivo = true;
    const buscar = () =>
      apiFetch(`/api/ranking?unit=${unit}&periodo=${periodo}`)
        .then((r) => r.json())
        .then((j) => vivo && setDados(j))
        .catch(() => vivo && setDados({ ok: false }));
    buscar();
    const t = setInterval(buscar, 120000);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [unit, periodo]);

  const equipe = dados?.equipe || [];
  const comValores = equipe.some((x) => typeof x.fat === "number");
  const total = equipe.reduce((a, x) => a + ((comValores ? x.fat : x.vendas) || 0), 0);

  return (
    <div className="app app-tv">
      <div className="main">
        <div className="tv">
          <Ambient />
          <header className="tv-head">
            <div>
              <p className="tv-kicker">Ranking do time</p>
              <h2 className="tv-title">{dados?.casa || "Animal Center"}</h2>
              <p className="tv-sub">
                {dados?.diaLabel ? `${dados.diaLabel} · ` : ""}
                {dados?.ok ? `${dados.rows} vendas lidas` : "aguardando o robo"}
              </p>
            </div>
            <div className="tv-total">
              <span>{comValores ? "Total do time" : "Vendas do time"}</span>
              <strong>
                <Num value={total} format={comValores ? brl : inteiro} ms={1600} />
              </strong>
            </div>
          </header>
          <Podium
            equipe={equipe}
            brl={brl}
            fotos={dados?.fotos}
            diagnostico={`${dados?.casa || ""} · ${dados?.diaLabel || ""} · ${equipe.length} pessoa(s)`}
          />
        </div>
      </div>
    </div>
  );
}
