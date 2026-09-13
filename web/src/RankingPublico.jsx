/* Telao do corredor: sem login, e por isso alimentado por /api/ranking, que
   nao carrega nada de tutor. Se ele usasse /api/snapshot, trancar o painel
   nao adiantaria — a URL aberta entregaria telefone e endereco do mesmo jeito. */
import { useEffect, useState } from "react";
import Podium, { Ambient } from "./Podium.jsx";
import { Num } from "./anim.jsx";
import "./index.css";

const brl = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function RankingPublico() {
  const p = new URLSearchParams(window.location.search);
  const unit = p.get("unit") || "matriz";
  const periodo = p.get("periodo") || "mes";
  const [dados, setDados] = useState(null);

  useEffect(() => {
    let vivo = true;
    const buscar = () =>
      fetch(`/api/ranking?unit=${unit}&periodo=${periodo}`)
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
  const total = equipe.reduce((a, x) => a + (x.fat || 0), 0);

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
              <span>Total do time</span>
              <strong>
                <Num value={total} format={brl} ms={1600} />
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
