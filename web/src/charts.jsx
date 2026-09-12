/* Graficos: gradiente ciano->teal, eixo/rotulo/valor/gridline sempre,
   e desenho animado na entrada. Cor vem dos tokens — zero hex solto. */

const AXIS = "var(--text-3)";
const GRID = "var(--line)";
const LABEL = "var(--text-2)";

/* Rampa categorica do acento: ciano -> teal -> azul -> ardosia */
const SERIES = ["#3ec8f0", "#2ad4c8", "#4f8ff7", "#1f9bb5", "#7a8fb5", "#5ee0ff", "#3c5070"];

function shortMil(n) {
  const v = Math.round(Number(n) || 0);
  if (!v) return "";
  if (v >= 10000) return `${Math.round(v / 1000).toLocaleString("pt-BR")} mil`;
  if (v >= 1000) return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return v.toLocaleString("pt-BR");
}

const money = (v) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/* Definicoes de gradiente reusadas por todos os graficos */
function Grads({ id }) {
  return (
    <defs>
      <linearGradient id={`${id}-on`} x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor="#2ad4c8" />
        <stop offset="100%" stopColor="#3ec8f0" />
      </linearGradient>
      <linearGradient id={`${id}-off`} x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor="var(--bar-off-a)" />
        <stop offset="100%" stopColor="var(--bar-off-b)" />
      </linearGradient>
      <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#3ec8f0" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#3ec8f0" stopOpacity="0" />
      </linearGradient>
      <linearGradient id={`${id}-line`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#3ec8f0" />
        <stop offset="100%" stopColor="#2ad4c8" />
      </linearGradient>
    </defs>
  );
}

/* Gridlines horizontais + rotulo do eixo Y */
function Grid({ w, top, base, max, steps = 4, padLeft = 0 }) {
  const lines = [];
  for (let i = 0; i <= steps; i += 1) {
    const v = (max / steps) * i;
    const y = base - ((base - top) * i) / steps;
    lines.push(
      <g key={i}>
        <line x1={padLeft} y1={y} x2={w} y2={y} stroke={GRID} strokeWidth="1" />
        <text x={0} y={y - 4} fontSize="9" fill={AXIS}>
          {i === 0 ? "0" : shortMil(v)}
        </text>
      </g>
    );
  }
  return <g>{lines}</g>;
}

export function DailyBars({ days = [], h = 340 }) {
  const last = Math.max(1, ...days.filter((d) => d.fat).map((d) => d.d), 1);
  const vis = days.filter((d) => d.d <= last);
  const w = 720;
  const max = Math.max(1, ...vis.map((d) => d.fat));
  const n = Math.max(1, vis.length);
  const padLeft = 40;
  const bw = (w - padLeft - 8) / n;
  const top = 26;
  const base = h - 22;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart daily" role="img" aria-label="Faturamento por dia">
      <Grads id="db" />
      <Grid w={w} top={top} base={base} max={max} padLeft={padLeft} />
      {vis.map((d, i) => {
        const x = padLeft + i * bw;
        const barH = (d.fat / max) * (base - top);
        const y = base - barH;
        const cx = x + bw / 2;
        const isTop = d.fat === max && d.fat > 0;
        const showDay = n <= 16 || i === 0 || i === n - 1 || d.d % 2 === 1;
        return (
          <g key={d.d}>
            <title>{`Dia ${d.d}: ${money(d.fat)}`}</title>
            <rect
              className="bar-grow"
              style={{ animationDelay: `${i * 22}ms` }}
              x={x + 1}
              y={d.fat ? y : base - 2}
              width={Math.max(2, bw - 3)}
              height={d.fat ? barH : 2}
              rx="4"
              fill={d.fat ? `url(#db-${isTop ? "on" : "off"})` : "var(--track)"}
            />
            {d.fat && (n <= 14 || d.d % 2 === 0 || barH > 40) ? (
              <text
                x={cx}
                y={Math.max(12, y - 6)}
                textAnchor="middle"
                fontSize={n > 20 ? 8 : 9}
                fill={isTop ? "var(--accent-text)" : LABEL}
                fontWeight="600"
              >
                {shortMil(d.fat)}
              </text>
            ) : null}
            {showDay ? (
              <text x={cx} y={h - 6} textAnchor="middle" fontSize="9" fill={AXIS}>
                {d.d}
              </text>
            ) : null}
          </g>
        );
      })}
      <line x1={padLeft} y1={base} x2={w} y2={base} stroke={GRID} strokeWidth="1" />
    </svg>
  );
}

export function LineChart({ series = [], labels = [], h = 170 }) {
  const w = 520;
  const padLeft = 40;
  const max = Math.max(1, ...series);
  const top = 18;
  const base = h - 22;
  const xAt = (i) => padLeft + (i * (w - padLeft - 12)) / Math.max(1, series.length - 1);
  const yAt = (v) => base - (v / max) * (base - top);
  const pts = series.map((v, i) => `${xAt(i)},${yAt(v)}`);
  const line = pts.join(" ");
  const area = `${xAt(0)},${base} ${line} ${xAt(series.length - 1)},${base}`;

  // comprimento aproximado da polilinha, para o desenho animado
  let len = 0;
  for (let i = 1; i < series.length; i += 1) {
    len += Math.hypot(xAt(i) - xAt(i - 1), yAt(series[i]) - yAt(series[i - 1]));
  }
  len = Math.ceil(len) || 1000;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart" role="img" aria-label="Faturamento por mes">
      <Grads id="lc" />
      <Grid w={w} top={top} base={base} max={max} padLeft={padLeft} />
      <polyline points={area} fill="url(#lc-area)" stroke="none" />
      <polyline
        className="draw"
        style={{ "--len": len }}
        points={line}
        fill="none"
        stroke="url(#lc-line)"
        strokeWidth="2.4"
        strokeLinejoin="round"
        strokeLinecap="round"
        strokeDasharray={len}
      />
      {series.map((v, i) => (
        <g key={i} className="dot" style={{ animationDelay: `${600 + i * 40}ms` }}>
          <title>{`${labels[i] || i + 1}: ${money(v)}`}</title>
          <circle cx={xAt(i)} cy={yAt(v)} r="3" fill="var(--surface-1)" stroke="var(--cyan)" strokeWidth="1.8" />
        </g>
      ))}
      {labels.map((lb, i) => (
        <text key={`${i}-${lb}`} x={xAt(i)} y={h - 5} textAnchor="middle" fontSize="9" fill={AXIS}>
          {lb}
        </text>
      ))}
      <line x1={padLeft} y1={base} x2={w - 12} y2={base} stroke={GRID} strokeWidth="1" />
    </svg>
  );
}

export function Donut({ slices, totalLabel, totalValue }) {
  const sum = slices.reduce((a, s) => a + s.value, 0) || 1;
  let acc = 0;
  const r = 58;
  const c = 2 * Math.PI * r;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 160 160" className="donut" role="img" aria-label={totalLabel}>
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--track)" strokeWidth="15" />
        <g transform="rotate(-90 80 80)">
          {slices.map((s, i) => {
            const len = (s.value / sum) * c;
            const el = (
              <circle
                key={s.nome}
                cx="80"
                cy="80"
                r={r}
                fill="none"
                stroke={SERIES[i % SERIES.length]}
                strokeWidth="15"
                strokeLinecap="round"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-acc}
              >
                <title>{`${s.nome}: ${s.hint || s.value} (${Math.round((s.value / sum) * 100)}%)`}</title>
                <animate
                  attributeName="stroke-dasharray"
                  from={`0 ${c}`}
                  to={`${len} ${c - len}`}
                  dur="0.9s"
                  begin={`${i * 90}ms`}
                  fill="freeze"
                  calcMode="spline"
                  keySplines="0.16 1 0.3 1"
                />
              </circle>
            );
            acc += len;
            return el;
          })}
        </g>
        <text x="80" y="74" textAnchor="middle" fontSize="10" fill={AXIS}>
          {totalLabel}
        </text>
        <text
          x="80"
          y="95"
          textAnchor="middle"
          fontSize="13"
          fontWeight="700"
          fill="var(--text)"
          fontFamily="var(--mono)"
        >
          {totalValue}
        </text>
      </svg>
      <ul className="legend">
        {slices.map((s, i) => (
          <li key={s.nome} style={{ animationDelay: `${i * 50}ms` }}>
            <i style={{ background: SERIES[i % SERIES.length] }} />
            <span>{s.nome}</span>
            <b>{s.hint || s.value}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* Radar — o painel "Structure" da referencia */
export function Radar({ slices = [] }) {
  const n = slices.length || 1;
  const max = Math.max(1, ...slices.map((s) => s.value));
  const cx = 140;
  const cy = 140;
  const r = 84;
  const pt = (i, v) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const rr = r * (v / max);
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  };
  const rings = [0.25, 0.5, 0.75, 1];
  const poly = slices.map((s, i) => pt(i, s.value).join(",")).join(" ");
  return (
    <svg viewBox="0 0 280 280" className="chart radar" role="img" aria-label="Participacao por grupo">
      <defs>
        <radialGradient id="radar-fill">
          <stop offset="0%" stopColor="#2ad4c8" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#3ec8f0" stopOpacity="0.16" />
        </radialGradient>
      </defs>
      {rings.map((k) => (
        <polygon
          key={k}
          fill="none"
          stroke={GRID}
          strokeWidth="1"
          points={slices.map((_, i) => pt(i, max * k).join(",")).join(" ")}
        />
      ))}
      {slices.map((s, i) => {
        const [x, y] = pt(i, max);
        return <line key={s.nome} x1={cx} y1={cy} x2={x} y2={y} stroke={GRID} strokeWidth="1" />;
      })}
      <polygon className="shape" points={poly} fill="url(#radar-fill)" stroke="var(--cyan)" strokeWidth="2" />
      {slices.map((s, i) => {
        const [x, y] = pt(i, s.value);
        return (
          <circle key={`d-${s.nome}`} className="dot" style={{ animationDelay: `${500 + i * 60}ms` }} cx={x} cy={y} r="3" fill="var(--cyan)" />
        );
      })}
      {slices.map((s, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const x = cx + Math.cos(a) * 116;
        const y = cy + Math.sin(a) * 116;
        return (
          <text key={s.nome} x={x} y={y} textAnchor="middle" fontSize="11" fill={AXIS}>
            <title>{`${s.nome}: ${s.hint || s.value}`}</title>
            {s.nome}
          </text>
        );
      })}
    </svg>
  );
}

export function SparkBars({ values }) {
  const max = Math.max(1, ...values);
  return (
    <div className="spark">
      {values.map((v, i) => (
        <span key={i} style={{ height: `${(v / max) * 100}%`, animationDelay: `${i * 30}ms` }} />
      ))}
    </div>
  );
}

export function Hourly({ values }) {
  const max = Math.max(1, ...values);
  return (
    <div className="hourly">
      {values.map((v, i) => (
        <div key={i} className="hcol" title={`${String(i).padStart(2, "0")}h: ${money(v)}`}>
          <span style={{ height: `${(v / max) * 100}%`, animationDelay: `${i * 18}ms` }} />
          {i % 3 === 0 ? <em>{String(i).padStart(2, "0")}</em> : <em />}
        </div>
      ))}
    </div>
  );
}

/* Treemap — o "_Faturamento por Pilar" do BI antigo. A area conta a
   participacao melhor que barra quando uma fatia domina as outras. */
export function Treemap({ slices = [], brl }) {
  const total = slices.reduce((a, s) => a + (s.value || 0), 0) || 1;
  const dados = [...slices].filter((s) => s.value > 0).sort((a, b) => b.value - a.value);
  const W = 320;
  const H = 200;

  /* Squarify simplificado: corta a faixa mais longa a cada passo, o que
     evita os retangulos finos que o corte fixo produz. */
  const caixas = [];
  let x = 0, y = 0, w = W, h = H;
  let resto = total;
  dados.forEach((d, i) => {
    const parte = d.value / resto;
    const ultimo = i === dados.length - 1;
    if (w >= h) {
      const cw = ultimo ? w : w * parte;
      caixas.push({ ...d, x, y, w: cw, h });
      x += cw; w -= cw;
    } else {
      const ch = ultimo ? h : h * parte;
      caixas.push({ ...d, x, y, w, h: ch });
      y += ch; h -= ch;
    }
    resto -= d.value;
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart treemap" role="img" aria-label="Faturamento por pilar">
      {caixas.map((c, i) => {
        const cor = SERIES[i % SERIES.length];
        const cabe = c.w > 52 && c.h > 26;
        return (
          <g key={c.nome}>
            <title>{`${c.nome}: ${brl ? brl(c.value) : c.value} (${Math.round((c.value / total) * 100)}%)`}</title>
            <rect x={c.x + 1} y={c.y + 1} width={Math.max(0, c.w - 2)} height={Math.max(0, c.h - 2)} rx="4" fill={cor} opacity="0.88" />
            {cabe ? (
              <>
                <text x={c.x + 8} y={c.y + 17} fontSize="9" fontWeight="600" fill="#06212c">
                  {c.nome.length > 13 ? `${c.nome.slice(0, 12)}…` : c.nome}
                </text>
                <text x={c.x + 8} y={c.y + 29} fontSize="9" fill="#06212c" opacity="0.75" fontFamily="var(--mono)">
                  {Math.round((c.value / total) * 100)}%
                </text>
              </>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/* Volume x ticket por pessoa, eixo duplo — a p7 do BI antigo. Barra e
   quantidade, ponto e ticket: quem vende muito nem sempre vende caro. */
export function VolumeTicket({ pessoas = [], brl }) {
  const dados = [...pessoas].filter((p) => p.vendas).sort((a, b) => b.vendas - a.vendas).slice(0, 10);
  if (!dados.length) return <p className="hint">Sem vendas no recorte.</p>;
  const w = 560, h = 220, padLeft = 40, padBaixo = 46, top = 16;
  const base = h - padBaixo;
  const maxV = Math.max(1, ...dados.map((p) => p.vendas));
  const maxT = Math.max(1, ...dados.map((p) => p.ticket || 0));
  const bw = (w - padLeft - 12) / dados.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart" role="img" aria-label="Volume e ticket por pessoa">
      <Grads id="vt" />
      <Grid w={w} top={top} base={base} max={maxV} padLeft={padLeft} steps={3} />
      {dados.map((p, i) => {
        const x = padLeft + i * bw;
        const bh = (p.vendas / maxV) * (base - top);
        const yT = base - ((p.ticket || 0) / maxT) * (base - top);
        return (
          <g key={p.nome}>
            <title>{`${p.nome}: ${p.vendas} vendas · ticket ${brl ? brl(p.ticket) : p.ticket}`}</title>
            <rect className="bar-grow" style={{ animationDelay: `${i * 40}ms` }} x={x + 3} y={base - bh} width={Math.max(3, bw - 8)} height={bh} rx="3" fill="url(#vt-off)" />
            <circle className="dot" style={{ animationDelay: `${300 + i * 40}ms` }} cx={x + bw / 2} cy={yT} r="3.4" fill="var(--surface-1)" stroke="var(--cyan)" strokeWidth="1.8" />
            <text x={x + bw / 2} y={h - 30} textAnchor="middle" fontSize="8" fill={AXIS} transform={`rotate(-32 ${x + bw / 2} ${h - 30})`}>
              {p.nome.split(" ")[0]}
            </text>
          </g>
        );
      })}
      <line x1={padLeft} y1={base} x2={w - 12} y2={base} stroke={GRID} />
    </svg>
  );
}

/* Anos sobrepostos — as quatro linhas da p1 do BI antigo. O portal ja tinha
   o historico desde 2023; faltava so guardar a serie mensal por ano. */
export function MultiLine({ porAno = {}, campo = "fat", fmt, h = 200 }) {
  const anos = Object.keys(porAno).sort();
  if (!anos.length) return <p className="hint">Sem historico no recorte.</p>;
  const w = 560, padLeft = 44, top = 16, base = h - 34;
  const series = anos.map((a) => porAno[a][campo] || []);
  const max = Math.max(1, ...series.flat());
  const xAt = (i) => padLeft + (i * (w - padLeft - 14)) / 11;
  const yAt = (v) => base - (v / max) * (base - top);
  const MES = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart" role="img" aria-label="Comparativo entre anos">
      <Grads id={`ml-${campo}`} />
      <Grid w={w} top={top} base={base} max={max} padLeft={padLeft} steps={3} />
      {series.map((vals, si) => {
        /* So desenha ate o ultimo mes com dado: senao o ano corrente
           despenca para zero em outubro e parece queda, nao mes futuro. */
        const ate = vals.reduce((u, v, i) => (v ? i : u), -1);
        if (ate < 0) return null;
        const pts = vals.slice(0, ate + 1).map((v, i) => `${xAt(i)},${yAt(v)}`).join(" ");
        const cor = SERIES[si % SERIES.length];
        const atual = si === series.length - 1;
        return (
          <g key={anos[si]}>
            <polyline
              points={pts}
              fill="none"
              stroke={cor}
              strokeWidth={atual ? 2.6 : 1.6}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={atual ? 1 : 0.65}
            />
            {atual
              ? vals.slice(0, ate + 1).map((v, i) => (
                  <g key={i}>
                    <title>{`${MES[i]} ${anos[si]}: ${fmt ? fmt(v) : v}`}</title>
                    <circle cx={xAt(i)} cy={yAt(v)} r="2.8" fill="var(--surface-1)" stroke={cor} strokeWidth="1.6" />
                  </g>
                ))
              : null}
          </g>
        );
      })}
      {MES.map((m, i) => (
        <text key={i} x={xAt(i)} y={h - 18} textAnchor="middle" fontSize="9" fill={AXIS}>
          {m}
        </text>
      ))}
      <line x1={padLeft} y1={base} x2={w - 14} y2={base} stroke={GRID} />
      {anos.map((a, i) => (
        <g key={a}>
          <rect x={padLeft + i * 58} y={h - 10} width="10" height="3" rx="1.5" fill={SERIES[i % SERIES.length]} />
          <text x={padLeft + i * 58 + 14} y={h - 6} fontSize="9" fill={AXIS}>
            {a}
          </text>
        </g>
      ))}
    </svg>
  );
}
