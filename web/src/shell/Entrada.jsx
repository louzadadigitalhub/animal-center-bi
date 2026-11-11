import { useEffect, useRef } from "react";
import { MonitorPlay } from "@phosphor-icons/react/MonitorPlay";
import { UsersThree } from "@phosphor-icons/react/UsersThree";
import { ArrowRight } from "@phosphor-icons/react/ArrowRight";
import { ChartBar } from "@phosphor-icons/react/ChartBar";
import { PawPrint } from "@phosphor-icons/react/PawPrint";
import { CurrencyDollar } from "@phosphor-icons/react/CurrencyDollar";
import Pulso from "./Pulso.jsx";

/* Tela de entrada no molde do painel de referencia: cena de um lado, formulario do outro.
   No lugar de uma foto, a cena
   e feita em codigo: a grade da sala de controle, o logo aceso e a linha de
   batimento correndo, que e o "ao vivo" de um hospital veterinario.
   O fundo anda um pouco com o mouse; com "reduzir movimento" fica parado.
   O login e o mesmo de antes (Supabase), so a roupa mudou. */
export default function Entrada({ email, senha, erro, ocupado, aoEmail, aoSenha, aoEntrar }) {
  const cena = useRef(null);
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

  return (
    <div className="entrada" ref={cena}>
      <div className="en-fundo" aria-hidden="true">
        <div className="en-grade" />
        <div className="en-brilho" />
        <Pulso className="en-pulso" batidas={5} />
        <Pulso className="en-pulso en-pulso-eco" batidas={3} />
      </div>

      <main className="en-hero">
        <div className="en-marca">
          <span className="en-icone">
            <img src="/logo-dark.png" alt="" width="512" height="512" />
          </span>
          <img className="en-logo" src="/marca-animal-center.webp" alt="Animal Center, centro veterinário 24h" width="543" height="200" />
        </div>
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
  );
}
