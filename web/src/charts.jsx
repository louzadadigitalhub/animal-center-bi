const C = {
  green: "#3ec8f0",
  navy: "#12203a",
  mist: "#c5d0e0",
  teal: "#2ad4c8",
  ink: "#7a8aa3",
  frost: "#eef3f9",
};

function shortMil(n) {
  const v = Math.round(Number(n) || 0);
  if (!v) return "";
  if (v >= 10000) return `${Math.round(v / 1000).toLocaleString("pt-BR")} mil`;
  if (v >= 1000) return `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return v.toLocaleString("pt-BR");
}

export function DailyBars({ days = [], h = 340 }) {
  const last = Math.max(1, ...days.filter((d) => d.fat).map((d) => d.d), 1);
  const vis = days.filter((d) => d.d <= last);
  const w = 720;
  const max = Math.max(1, ...vis.map((d) => d.fat));
  const n = Math.max(1, vis.length);
  const bw = (w - 36) / n;
  const top = 22;
  const base = h - 22;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart daily" role="img">
      <defs>
        <linearGradient id="inflow" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#2ad4c8" />
          <stop offset="100%" stopColor="#3ec8f0" />
        </linearGradient>
      </defs>
      {vis.map((d, i) => {
        const x = 18 + i * bw;
        const barH = (d.fat / max) * (base - top);
        const y = base - barH;
        const cx = x + bw / 2;
        const showDay = n <= 16 || i === 0 || i === n - 1 || d.d % 2 === 1;
        return (
          <g key={d.d}>
            <title>{`Dia ${d.d}: ${d.fat.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}`}</title>
            <rect x={x + 1} y={y} width={Math.max(2, bw - 3)} height={barH} rx="3" fill={d.fat ? "url(#inflow)" : "#c5d0e0"} opacity={d.fat ? 0.95 : 0.35} />
            {d.fat && (n <= 14 || d.d % 2 === 0 || barH > 40) ? (
              <text x={cx} y={Math.max(12, y - 4)} textAnchor="middle" fontSize={n > 20 ? 8 : 9} fill="#12203a" fontWeight="600">
                {shortMil(d.fat)}
              </text>
            ) : null}
            {showDay ? (
              <text x={cx} y={h - 6} textAnchor="middle" fontSize="9" fill="#657694">
                {d.d}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export function BarPair({ a = [], b = [], labels = [], h = 160 }) {
  const n = labels.length;
  const max = Math.max(1, ...a, ...b);
  const w = 520;
  const gap = 8;
  const bw = (w - 32) / n;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart" role="img">
      {labels.map((lb, i) => {
        const x = 16 + i * bw;
        const ha = (a[i] / max) * (h - 28);
        const hb = (b[i] / max) * (h - 28);
        return (
          <g key={lb}>
            <rect x={x} y={h - 18 - ha} width={bw / 2 - 2} height={ha} rx="3" fill={C.navy} opacity="0.28" />
            <rect x={x + bw / 2} y={h - 18 - hb} width={bw / 2 - 2} height={hb} rx="3" fill={C.green} />
            <text x={x + bw / 2} y={h - 4} textAnchor="middle" fontSize="9" fill={C.ink}>
              {lb}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function LineChart({ series = [], labels = [], h = 140 }) {
  const w = 520;
  const max = Math.max(1, ...series);
  const pts = series
    .map((v, i) => {
      const x = 16 + (i * (w - 32)) / Math.max(1, series.length - 1);
      const y = h - 22 - (v / max) * (h - 36);
      return `${x},${y}`;
    })
    .join(" ");
  const area = `16,${h - 22} ${pts} ${w - 16},${h - 22}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart" role="img">
      <polyline points={area} fill="rgba(0,224,92,0.16)" stroke="none" />
      <polyline points={pts} fill="none" stroke={C.green} strokeWidth="2.4" />
      {series.map((v, i) => {
        const x = 16 + (i * (w - 32)) / Math.max(1, series.length - 1);
        const y = h - 22 - (v / max) * (h - 36);
        return <circle key={i} cx={x} cy={y} r="2.4" fill={C.navy} />;
      })}
      {labels.map((lb, i) => {
        const x = 16 + (i * (w - 32)) / Math.max(1, labels.length - 1);
        return (
          <text key={lb} x={x} y={h - 4} textAnchor="middle" fontSize="9" fill={C.ink}>
            {lb}
          </text>
        );
      })}
    </svg>
  );
}

export function Donut({ slices, totalLabel, totalValue }) {
  const sum = slices.reduce((a, s) => a + s.value, 0) || 1;
  let acc = 0;
  const colors = ["#3ec8f0", "#12203a", "#2ad4c8", "#1b2e52", "#7a8aa3", "#5ee0ff", "#2b3a57"];
  const r = 56;
  const c = 2 * Math.PI * r;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 160 160" className="donut">
        <g transform="rotate(-90 80 80)">
          {slices.map((s, i) => {
            const len = (s.value / sum) * c;
            const dash = `${len} ${c - len}`;
            const el = (
              <circle
                key={s.nome}
                cx="80"
                cy="80"
                r={r}
                fill="none"
                stroke={colors[i % colors.length]}
                strokeWidth="18"
                strokeDasharray={dash}
                strokeDashoffset={-acc}
              />
            );
            acc += len;
            return el;
          })}
        </g>
        <text x="80" y="74" textAnchor="middle" fontSize="12" fill="#7a8aa3">
          {totalLabel}
        </text>
        <text x="80" y="94" textAnchor="middle" fontSize="14" fontWeight="700" fill="#12203a">
          {totalValue}
        </text>
      </svg>
      <ul className="legend">
        {slices.map((s, i) => (
          <li key={s.nome}>
            <i style={{ background: colors[i % colors.length] }} />
            <span>{s.nome}</span>
            <b>{s.hint || s.value}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Radar({ slices = [] }) {
  const n = slices.length || 1;
  const max = Math.max(1, ...slices.map((s) => s.value));
  const cx = 140;
  const cy = 140;
  const r = 88;
  const pt = (i, v) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const rr = r * (v / max);
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  };
  const rings = [0.35, 0.65, 1];
  const poly = slices.map((s, i) => pt(i, s.value).join(",")).join(" ");
  return (
    <svg viewBox="0 0 280 280" className="chart radar">
      {rings.map((k) => (
        <polygon
          key={k}
          fill="none"
          stroke="rgba(22,33,54,.12)"
          points={slices.map((_, i) => pt(i, max * k).join(",")).join(" ")}
        />
      ))}
      {slices.map((s, i) => {
        const [x, y] = pt(i, max);
        return <line key={s.nome} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(22,33,54,.12)" />;
      })}
      <polygon points={poly} fill="rgba(0,224,92,.22)" stroke="#00e05c" strokeWidth="2" />
      {slices.map((s, i) => {
        const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
        const x = cx + Math.cos(a) * 118;
        const y = cy + Math.sin(a) * 118;
        return (
          <text key={s.nome} x={x} y={y} textAnchor="middle" fontSize="12" fill="#12203a">
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
        <span key={i} style={{ height: `${(v / max) * 100}%` }} />
      ))}
    </div>
  );
}

export function Hourly({ values }) {
  const max = Math.max(1, ...values);
  return (
    <div className="hourly">
      {values.map((v, i) => (
        <div key={i} className="hcol">
          <span style={{ height: `${(v / max) * 100}%` }} />
          {i % 3 === 0 ? <em>{String(i).padStart(2, "0")}</em> : <em />}
        </div>
      ))}
    </div>
  );
}
