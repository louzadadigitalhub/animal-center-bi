import { useEffect, useRef, useState } from "react";

export const prefersReduced = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/* Um unico requestAnimationFrame para o app inteiro.
   Cada componente assina; o loop so roda enquanto houver assinante.
   Evita 5 loops concorrentes brigando no PC da TV. */
const subs = new Set();
let raf = 0;
let prev = 0;

function tick(t) {
  const dt = prev ? Math.min(64, t - prev) : 16;
  prev = t;
  subs.forEach((fn) => fn(t, dt));
  raf = subs.size ? requestAnimationFrame(tick) : 0;
}

export function useRaf(cb, on = true) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (!on || prefersReduced()) return undefined;
    const fn = (t, dt) => ref.current(t, dt);
    subs.add(fn);
    if (!raf) {
      prev = 0;
      raf = requestAnimationFrame(tick);
    }
    return () => {
      subs.delete(fn);
      if (!subs.size && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };
  }, [on]);
}

/* Conta ate o valor na entrada. */
export function useCountUp(target, ms = 900) {
  const [n, setN] = useState(target);
  useEffect(() => {
    const end = Number(target) || 0;
    if (prefersReduced() || !end) {
      setN(end);
      return undefined;
    }
    let id = 0;
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / ms);
      setN(end * (1 - Math.pow(1 - p, 3)));
      if (p < 1) id = requestAnimationFrame(step);
    };
    id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [target, ms]);
  return n;
}

export function Num({ value, format, ms }) {
  const n = useCountUp(value, ms);
  return <>{format(n)}</>;
}

/* Ajusta um <canvas> ao tamanho do pai, respeitando devicePixelRatio. */
export function useCanvasSize(ref) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = Math.max(1, Math.round(r.width * dpr));
      el.height = Math.max(1, Math.round(r.height * dpr));
      setSize({ w: r.width, h: r.height, dpr });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}
