import { useLayoutEffect, useRef, useState } from "react";

/* Marcador que desliza ate o item escolhido (menu lateral e abas). Mede o
   item com aria-current dentro do container e devolve a posicao para um
   <span> absoluto; a transicao em CSS faz o deslize. Remede quando o
   container muda de tamanho (fonte carregando, janela, menu abrindo). */
export function useIndicador(chave) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return undefined;
    const medir = () => {
      const el = box.querySelector('[aria-current="page"]');
      if (!el) {
        setPos(null);
        return;
      }
      setPos({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(box);
    return () => ro.disconnect();
  }, [chave]);
  const style = pos
    ? { transform: `translate3d(${pos.x}px, ${pos.y}px, 0)`, width: pos.w, height: pos.h, opacity: 1 }
    : { opacity: 0 };
  return [ref, style];
}
