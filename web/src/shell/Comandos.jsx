import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { ArrowElbowDownLeft } from "@phosphor-icons/react/ArrowElbowDownLeft";

/* Paleta de comandos (Ctrl/⌘+K), a mesma do painel de referencia: ir a qualquer
   area ou aba que a pessoa ja ve no menu. So navega. A lista vem pronta do
   Painel (as mesmas areas e abas liberadas para a conta), entao a paleta
   nunca abre o que o menu nao abriria. */

const normal = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export default function Comandos({ destinos, aoIr, aoFechar }) {
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState(0);
  const campo = useRef(null);
  const lista = useRef(null);
  const achados = useMemo(() => {
    const termos = normal(busca).split(/\s+/).filter(Boolean);
    return destinos.filter((d) => {
      const alvo = normal(`${d.area} ${d.rotulo}`);
      return termos.every((t) => alvo.includes(t));
    });
  }, [busca, destinos]);

  useEffect(() => setSel(0), [busca]);
  // abre com o cursor no campo; ao fechar, o foco volta para onde estava
  useEffect(() => {
    const antes = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    campo.current?.focus();
    return () => antes?.focus();
  }, []);
  useEffect(() => {
    lista.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const ir = (d) => {
    aoFechar();
    aoIr(d);
  };
  const tecla = (e) => {
    const ultimo = achados.length - 1;
    if (e.key === "ArrowDown") setSel((s) => (s >= ultimo ? 0 : s + 1));
    else if (e.key === "ArrowUp") setSel((s) => (s <= 0 ? Math.max(0, ultimo) : s - 1));
    else if (e.key === "Enter") {
      if (achados[sel]) ir(achados[sel]);
    } else if (e.key === "Escape") aoFechar();
    // o campo e a unica parada do Tab: o foco nao escapa para a tela de tras
    else if (e.key !== "Tab") return;
    e.preventDefault();
  };
  const ativo = achados[sel];

  return (
    <div className="cmd-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className="cmd" role="dialog" aria-modal="true" aria-label="Ir para uma área ou aba" onKeyDown={tecla}>
        <div className="cmd-campo">
          <MagnifyingGlass size={18} aria-hidden />
          <input
            ref={campo}
            type="text"
            role="combobox"
            aria-expanded={achados.length > 0}
            aria-controls="cmd-lista"
            aria-autocomplete="list"
            aria-activedescendant={ativo ? `cmd-${ativo.chave}` : undefined}
            placeholder="Ir para uma área ou aba"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          <kbd>Esc</kbd>
        </div>
        <ul id="cmd-lista" ref={lista} role="listbox" className="cmd-lista" aria-label="Áreas e abas">
          {achados.map((d, i) => {
            const Icon = d.icon;
            return (
              <li
                key={d.chave}
                id={`cmd-${d.chave}`}
                role="option"
                aria-selected={i === sel}
                className={`cmd-item${i === sel ? " is-on" : ""}${d.aba ? " is-aba" : ""}`}
                onMouseMove={() => i !== sel && setSel(i)}
                onClick={() => ir(d)}
              >
                <span className="cmd-ico" aria-hidden>
                  <Icon size={16} />
                </span>
                <span className="cmd-texto">
                  {d.aba ? <small>{d.area}</small> : null}
                  {d.rotulo}
                </span>
                <ArrowElbowDownLeft className="cmd-enter" size={14} aria-hidden />
              </li>
            );
          })}
        </ul>
        {/* fora da lista: listbox so pode ter option dentro */}
        {!achados.length ? (
          <p className="cmd-nada" role="status">
            Nenhuma área ou aba com “{busca}”.
          </p>
        ) : null}
        <p className="cmd-pe" aria-hidden>
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> escolher
          </span>
          <span>
            <kbd>Enter</kbd> abrir
          </span>
          <span>
            <kbd>Esc</kbd> fechar
          </span>
        </p>
      </div>
    </div>
  );
}
