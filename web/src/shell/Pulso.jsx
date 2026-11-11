import { useId, useMemo } from "react";

/* Linha de batimento (eletrocardiograma) no verde da marca. E o "ao vivo"
   de um hospital veterinario: aparece na entrada e na marca da barra
   lateral. O traco fraco fica parado; so o trecho claro corre por ele. */

function tracado(batidas) {
  const w = 1000 / batidas;
  let d = "M0 60";
  for (let i = 0; i < batidas; i += 1) {
    const x = i * w;
    const p = (f) => (x + w * f).toFixed(1);
    d +=
      ` L${p(0.3)} 60 Q${p(0.34)} 51 ${p(0.38)} 60 L${p(0.45)} 60` +
      ` L${p(0.475)} 67 L${p(0.5)} 10 L${p(0.53)} 84 L${p(0.555)} 60` +
      ` L${p(0.64)} 60 Q${p(0.71)} 45 ${p(0.78)} 60 L${p(1)} 60`;
  }
  return d;
}

export default function Pulso({ batidas = 4, className = "" }) {
  const d = useMemo(() => tracado(batidas), [batidas]);
  const id = useId().replace(/:/g, "");
  return (
    <svg className={`pulso ${className}`} viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`pulso-${id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="var(--marca-a)" />
          <stop offset="1" stopColor="var(--marca-b)" />
        </linearGradient>
      </defs>
      <path className="pulso-base" d={d} pathLength="1000" />
      <path className="pulso-onda" d={d} pathLength="1000" style={{ stroke: `url(#pulso-${id})` }} />
    </svg>
  );
}
