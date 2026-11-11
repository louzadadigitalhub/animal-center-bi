import { useEffect, useState } from "react";
import { CornersOut } from "@phosphor-icons/react/CornersOut";
import Pulso from "./Pulso.jsx";
import "./tv.css";

/* Moldura das telas do corredor (/ranking e /tv), na mesma identidade do
   painel: fundo de sala de controle, marca no alto, selo do robo, relogio,
   batimento no rodape e o Juliano em cena. Sem login: nada aqui le dado,
   quem chama passa o que mostrar. */
export default function TvMoldura({ rotulo, titulo, sub, estado = "conectando", selo, direita, juliano, classe = "", children }) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  const hora = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  const telaCheia = () => document.documentElement.requestFullscreen?.().catch(() => {});

  return (
    <div className={`tvm ${classe}`}>
      <div className="tvm-fundo" aria-hidden="true" />
      <header className="tvm-topo">
        <img className="tvm-marca" src="/marca-animal-center.webp" alt="Animal Center, centro veterinário 24h" width="543" height="200" />
        <span className="tvm-divisor" aria-hidden="true" />
        <div className="tvm-titulo">
          <p className="tvm-rotulo">{rotulo}</p>
          <h1>{titulo}</h1>
          {sub ? <p className="tvm-sub">{sub}</p> : null}
        </div>
        {direita}
        <div className="tvm-relogio">
          <span className="tvm-hora">{hora}</span>
          {selo ? <span className={`sample is-${estado}`}>{selo}</span> : null}
        </div>
        <button type="button" className="tvm-cheia" onClick={telaCheia} aria-label="Tela cheia" title="Tela cheia">
          <CornersOut size={26} />
        </button>
      </header>
      <main className="tvm-corpo">{children}</main>
      {juliano ? <img className="tvm-juliano" src={juliano} alt="" aria-hidden="true" /> : null}
      <Pulso className={`tvm-pulso${estado === "vivo" ? " is-vivo" : ""}`} batidas={7} />
    </div>
  );
}
