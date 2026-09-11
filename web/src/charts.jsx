const C = {
  green: "#00e05c",
  navy: "#162136",
  mist: "#bfc7d9",
  teal: "#00995a",
  ink: "#657694",
  frost: "#f2f5fa",
};

export function DailyBars({ days = [], h = 280 }) {
  const w = 720;
  const max = Math.max(1, ...days.map((d) => d.fat));
  const n = Math.max(1, days.length);
  const bw = (w - 36) / n;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart daily" role="img">
      {days.map((d, i) => {
        const x = 18 + i * bw;
        const barH = (d.fat / max) * (h - 36);
        const show = i === 0 || i === n - 1 || d.d % 2 === 1;
        return (
          <g key={d.d}>
            <rect x={x + 1} y={h - 22 - barH} width={Math.max(2, bw - 3)} height={barH} rx="3" fill="#00e05c" opacity={d.fat ? 0.95 : 0.18} />
            {show ? (
              <text x={x + bw / 2} y={h - 6} textAnchor="middle" fontSize="9" fill="#657694">
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
  const colors = ["#00e05c", "#162136", "#2b3a57", "#657694", "#00995a", "#bfc7d9", "#00b259"];
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 120 120" className="donut">
        <g transform="rotate(-90 60 60)">
          {slices.map((s, i) => {
            const len = (s.value / sum) * c;
            const dash = `${len} ${c - len}`;
            const el = (
              <circle
                key={s.nome}
                cx="60"
                cy="60"
                r={r}
                fill="none"
                stroke={colors[i % colors.length]}
                strokeWidth="14"
                strokeDasharray={dash}
                strokeDashoffset={-acc}
              />
            );
            acc += len;
            return el;
          })}
        </g>
        <text x="60" y="56" textAnchor="middle" fontSize="11" fill="#657694">
          {totalLabel}
        </text>
        <text x="60" y="72" textAnchor="middle" fontSize="13" fontWeight="700" fill="#162136">
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
  const cx = 110;
  const cy = 110;
  const r = 62;
  const pt = (i, v) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const rr = r * (v / max);
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  };
  const rings = [0.35, 0.65, 1];
  const poly = slices.map((s, i) => pt(i, s.value).join(",")).join(" ");
  return (
    <svg viewBox="0 0 220 220" className="chart radar">
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
        const x = cx + Math.cos(a) * 92;
        const y = cy + Math.sin(a) * 92;
        return (
          <text key={s.nome} x={x} y={y} textAnchor="middle" fontSize="9" fill="#162136">
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
