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
import TvMoldura from "./shell/TvMoldura.jsx";
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

  /* Selo do robo, como na barra lateral do painel: verde com coleta ha
     menos de 60 min, ambar com a hora da ultima coleta, vermelho sem resposta. */
  const lidoEm = dados?.ok && dados.at ? new Date(dados.at) : null;
  const estado = !dados ? "conectando" : !dados.ok ? "erro" : lidoEm && Date.now() - lidoEm.getTime() > 60 * 60000 ? "parado" : "vivo";
  const fmt = (d, o) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", ...o }).replace(",", "");
  const selo = {
    conectando: "Conectando…",
    erro: "Robô fora do ar",
    parado: lidoEm ? `Última coleta ${fmt(lidoEm, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "Sem coleta",
    vivo: lidoEm ? `Ao vivo · ${fmt(lidoEm, { hour: "2-digit", minute: "2-digit" })}` : "Ao vivo",
  }[estado];
  const recorte = { mes: "Este mês", hoje: "Hoje", semana: "Esta semana" }[periodo] || periodo;
  const sub = [recorte, dados?.diaLabel, dados?.ok ? `${inteiro(dados.rows)} vendas lidas` : "aguardando o robô"].filter(Boolean).join(" · ");

  return (
    <TvMoldura
      classe="tvm-ranking"
      rotulo="Ranking do time"
      titulo={dados?.casa || "Animal Center"}
      sub={sub}
      estado={estado}
      selo={selo}
      juliano="/mascote/juliano-comemorando.webp"
      direita={
        <div className="tv-total">
          <span>{comValores ? "Total do time" : "Vendas do time"}</span>
          <strong>
            <Num value={total} format={comValores ? brl : inteiro} ms={1600} />
          </strong>
        </div>
      }
    >
      <Ambient />
      <Podium
        equipe={equipe}
        brl={brl}
        fotos={dados?.fotos}
        diagnostico={`${dados?.casa || ""} · ${dados?.diaLabel || ""} · ${equipe.length} pessoa(s)`}
      />
    </TvMoldura>
  );
}
