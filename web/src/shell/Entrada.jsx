import { useEffect, useRef, useState } from "react";
import { MonitorPlay } from "@phosphor-icons/react/MonitorPlay";
import { UsersThree } from "@phosphor-icons/react/UsersThree";
import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { ChartBar } from "@phosphor-icons/react/ChartBar";
import { PawPrint } from "@phosphor-icons/react/PawPrint";
import { CurrencyDollar } from "@phosphor-icons/react/CurrencyDollar";

/* Tela de entrada no molde do painel de referencia: a cena ocupa a tela e o
   texto e o formulario ficam na metade escura, a esquerda.

   A cena e o Juliano, o cachorro da clinica que virou mascote (tres patas:
   um braco so, o esquerdo), na recepcao a noite. No computador, por cima da
   foto entra o video dele acenando, em vaivem de 6 s: comeca e termina no
   mesmo quadro da foto, entao nada pula quando ele aparece nem quando volta
   ao inicio. O video so e pedido depois da foto pintada, e nao e pedido em
   celular nem com economia de dados.

   Foto e video andam um pouco com o mouse; com "reduzir movimento" o fundo
   fica parado (o video segue, como o mascote do painel de referencia).
   O login e o mesmo de antes (Supabase), so a roupa mudou. */

const CENA = { foto: "/mascote/cena-login.webp", video: "/mascote/juliano-cena.mp4" };
const LARGA = "(min-width: 900px) and (min-aspect-ratio: 5/4)";

function economizaDados() {
  return Boolean(navigator.connection?.saveData);
}

export default function Entrada({ email, senha, erro, ocupado, aoEmail, aoSenha, aoEntrar }) {
  const cena = useRef(null);
  const video = useRef(null);
  const [comVideo, setComVideo] = useState(false);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const el = cena.current;
    const fino = window.matchMedia?.("(pointer: fine)").matches;
    const calmo = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!el || !fino || calmo) return undefined;
    let raf = 0;
    const mover = (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.style.setProperty("--px", ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3));
        el.style.setProperty("--py", ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3));
      });
    };
    window.addEventListener("pointermove", mover);
    return () => {
      window.removeEventListener("pointermove", mover);
      cancelAnimationFrame(raf);
    };
  }, []);

  /* O video entra depois da primeira pintura, so em tela larga. */
  useEffect(() => {
    if (!window.matchMedia?.(LARGA).matches || economizaDados()) return undefined;
    const t = window.setTimeout(() => setComVideo(true), 400);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const v = video.current;
    if (!comVideo || !v) return;
    v.src = CENA.video;
    v.play().catch(() => {});
  }, [comVideo]);

  return (
    <div className="entrada" ref={cena}>
      <div className="en-cena" aria-hidden="true">
        <img className="en-foto" src={CENA.foto} alt="" width="1600" height="900" fetchPriority="high" />
        {comVideo ? (
          <video
            ref={video}
            className={`en-video${pronto ? " is-pronto" : ""}`}
            muted
            loop
            playsInline
            preload="none"
            tabIndex={-1}
            onPlaying={() => setPronto(true)}
          />
        ) : null}
      </div>

      <div className="en-coluna">
        <main className="en-hero">
          <img className="en-logo" src="/marca-animal-center.webp" alt="Animal Center, centro veterinário 24h" width="543" height="200" />
          <p className="en-sobre">Painel de gestão</p>
          <h1 className="en-titulo">
            Matriz e São Cristóvão
            <span>numa tela só.</span>
          </h1>
          <p className="en-texto">O robô lê o SimplesVet a cada 2 minutos. Vendas, equipe, clientes e o financeiro saem dali, sem planilha no meio.</p>
          <ul className="en-areas">
            <li>
              <ChartBar size={15} aria-hidden /> Vendas
            </li>
            <li>
              <UsersThree size={15} aria-hidden /> Equipe
            </li>
            <li>
              <PawPrint size={15} aria-hidden /> Clientes
            </li>
            <li>
              <CurrencyDollar size={15} aria-hidden /> Financeiro
            </li>
          </ul>
        </main>

        <form className="en-form" onSubmit={aoEntrar}>
          <h2>Entrar</h2>
          <p className="en-form-sub">Acesso restrito da diretoria.</p>
          {erro ? (
            <p className="portao-erro" role="alert">
              {erro}
            </p>
          ) : null}
          <label className="en-campo">
            E-mail
            <input type="email" required value={email} onChange={(e) => aoEmail(e.target.value)} autoComplete="username" />
          </label>
          <label className="en-campo">
            Senha
            <input type="password" required value={senha} onChange={(e) => aoSenha(e.target.value)} autoComplete="current-password" />
          </label>
          <button type="submit" className="en-botao" disabled={ocupado || !email || !senha}>
            {ocupado ? "Entrando…" : "Entrar"}
            <ArrowRight size={16} weight="bold" aria-hidden />
          </button>
          {/* Quem cai aqui sem ser da diretoria costuma ser a vendedora
              procurando o painel dela, ou alguem ligando a TV do corredor.
              Os dois caminhos ficam a um clique em vez de exigir decorar URL. */}
          <div className="portao-saidas">
            <span>Não é você?</span>
            <a href="/ranking" className="portao-saida">
              <MonitorPlay size={16} weight="fill" />
              Ranking do corredor
              <small>sem senha</small>
            </a>
            <a href="/eu" className="portao-saida">
              <UsersThree size={16} weight="fill" />
              Acesso das vendedoras
              <small>entra com PIN</small>
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
