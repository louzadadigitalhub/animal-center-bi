import { useEffect, useRef, useState } from "react";
import { Num, prefersReduced, useCanvasSize, useRaf } from "./anim.jsx";
import { isSystemName, slug } from "./slug.js";

/* ---------- Metais ---------- */

const METAL = {
  1: {
    nome: "Ouro",
    a: "#fff3b0",
    b: "#ffd54a",
    c: "#e09a16",
    gem: "#fff8d8",
    glow: "rgba(255, 205, 60, 0.55)",
  },
  2: {
    nome: "Prata",
    a: "#ffffff",
    b: "#dfe8f2",
    c: "#93a7bd",
    gem: "#ffffff",
    glow: "rgba(206, 222, 240, 0.45)",
  },
  3: {
    nome: "Bronze",
    a: "#ffd9b0",
    b: "#e2934f",
    c: "#a75f26",
    gem: "#ffe2c4",
    glow: "rgba(226, 147, 79, 0.45)",
  },
};

/* ---------- Coroa ----------
   Bob vertical, inclinacao e um brilho que atravessa o metal.
   Tudo escrito por rAF direto no atributo — sem re-render do React. */

function Crown({ rank }) {
  const m = METAL[rank];
  const gRef = useRef(null);
  const gleamRef = useRef(null);
  const gemsRef = useRef([]);
  const id = `crown-${rank}`;

  useRaf((t) => {
    gemsRef.current.forEach((el, i) => {
      if (!el) return;
      const o = 0.55 + 0.45 * Math.sin(t / 320 + i * 2.1 + rank);
      el.setAttribute("opacity", o.toFixed(2));
    });
    const g = gRef.current;
    if (g) {
      const ph = rank * 0.8;
      const y = Math.sin(t / 640 + ph) * (rank === 1 ? 5 : 3.5);
      const rot = Math.sin(t / 940 + ph) * (rank === 1 ? 4 : 2.8);
      g.setAttribute("transform", `translate(0 ${y}) rotate(${rot} 32 28)`);
    }
    const gl = gleamRef.current;
    if (gl) {
      // -1.3 -> 1.3, varrendo o metal; cada coroa em fase diferente
      const p = (((t / 2400 + rank * 0.3) % 1) * 2.6 - 1.3).toFixed(3);
      gl.setAttribute("gradientTransform", `translate(${p} 0)`);
    }
  });

  return (
    <svg className={`crown crown-${rank}`} viewBox="0 0 64 52" role="img" aria-label={`${m.nome} — ${rank}o lugar`}>
      <defs>
        <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={m.a} />
          <stop offset="45%" stopColor={m.b} />
          <stop offset="100%" stopColor={m.c} />
        </linearGradient>
        <linearGradient id={`${id}-gleam`} x1="0" y1="0" x2="1" y2="0" ref={gleamRef}>
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="42%" stopColor="#fff" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="58%" stopColor="#fff" stopOpacity="0" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}-glow`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g ref={gRef} filter={`url(#${id}-glow)`}>
        {/* corpo */}
        <path
          d="M6 40 L3 13 L18 24 L32 6 L46 24 L61 13 L58 40 Z"
          fill={`url(#${id}-metal)`}
          stroke={m.c}
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        {/* faixa */}
        <rect x="6" y="40" width="52" height="8" rx="3" fill={`url(#${id}-metal)`} stroke={m.c} strokeWidth="1.2" />
        {/* bolinhas das pontas */}
        <circle cx="3" cy="13" r="3.4" fill={m.a} stroke={m.c} strokeWidth="1" />
        <circle cx="32" cy="6" r="4" fill={m.a} stroke={m.c} strokeWidth="1" />
        <circle cx="61" cy="13" r="3.4" fill={m.a} stroke={m.c} strokeWidth="1" />
        {/* gemas */}
        <circle ref={(el) => (gemsRef.current[0] = el)} cx="18" cy="44" r="2.2" fill={m.gem} />
        <circle ref={(el) => (gemsRef.current[1] = el)} cx="32" cy="44" r="2.6" fill={m.gem} />
        <circle ref={(el) => (gemsRef.current[2] = el)} cx="46" cy="44" r="2.2" fill={m.gem} />
        {/* brilho por cima */}
        <path d="M6 40 L3 13 L18 24 L32 6 L46 24 L61 13 L58 40 Z" fill={`url(#${id}-gleam)`} />
        <rect x="6" y="40" width="52" height="8" rx="3" fill={`url(#${id}-gleam)`} />
      </g>
    </svg>
  );
}

/* ---------- Faiscas (so no ouro) ----------
   Particulas sobem, giram e apagam. Canvas proprio, assinando o mesmo rAF. */

function Sparkles({ rank }) {
  const m = METAL[rank];
  const ref = useRef(null);
  const parts = useRef([]);
  const { w, h, dpr = 1 } = useCanvasSize(ref);

  const spawn = (W, H) => ({
    x: Math.random() * W,
    y: H * (0.55 + Math.random() * 0.45),
    vx: (Math.random() - 0.5) * 10,
    vy: -(16 + Math.random() * 26),
    life: 0,
    max: 900 + Math.random() * 900,
    size: 1.4 + Math.random() * 2.4,
    spin: Math.random() * Math.PI,
  });

  useEffect(() => {
    if (!w || !h) return;
    parts.current = Array.from({ length: 22 }, () => {
      const p = spawn(w, h);
      p.life = Math.random() * p.max;
      return p;
    });
  }, [w, h]);

  useRaf((t, dt) => {
    const cv = ref.current;
    if (!cv || !w || !h) return;
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const s = dt / 1000;

    parts.current.forEach((p, i) => {
      p.life += dt;
      if (p.life >= p.max) {
        parts.current[i] = spawn(w, h);
        return;
      }
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.spin += s * 2.4;

      const k = p.life / p.max;
      const alpha = k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75;
      const r = p.size * (0.6 + 0.4 * Math.sin(p.spin * 2));

      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha) * 0.95;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.spin);
      ctx.fillStyle = m.a;
      ctx.shadowColor = m.glow;
      ctx.shadowBlur = 8;
      // estrela de 4 pontas
      ctx.beginPath();
      ctx.moveTo(0, -r * 2.6);
      ctx.quadraticCurveTo(0, 0, r * 2.6, 0);
      ctx.quadraticCurveTo(0, 0, 0, r * 2.6);
      ctx.quadraticCurveTo(0, 0, -r * 2.6, 0);
      ctx.quadraticCurveTo(0, 0, 0, -r * 2.6);
      ctx.fill();
      ctx.restore();
    });
  });

  return <canvas ref={ref} className="pod-sparks" aria-hidden />;
}

/* ---------- Confete ----------
   Estoura uma vez quando o lider entra (ou muda). Para sozinho quando acaba. */

function Confetti({ fireKey }) {
  const ref = useRef(null);
  const parts = useRef([]);
  const alive = useRef(false);
  const { w, h, dpr = 1 } = useCanvasSize(ref);
  const COLORS = ["#ffd54a", "#3ec8f0", "#2ad4c8", "#ffffff", "#e09a16", "#4f8ff7"];

  useEffect(() => {
    if (!w || !h || prefersReduced()) return;
    parts.current = Array.from({ length: 84 }, () => {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.1;
      const sp = 300 + Math.random() * 360;
      return {
        // sai da base do degrau e sobe passando pelo card, em vez de
        // estourar em cima do rosto e tampar o nome do lider
        x: w / 2 + (Math.random() - 0.5) * w * 0.55,
        y: h * 0.93,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 12,
        w: 5 + Math.random() * 6,
        h: 8 + Math.random() * 8,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        life: 0,
        max: 1900 + Math.random() * 900,
      };
    });
    alive.current = true;
  }, [w, h, fireKey]);

  useRaf((t, dt) => {
    const cv = ref.current;
    if (!cv || !w || !h) return;
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!alive.current) return;

    const s = dt / 1000;
    let living = 0;
    parts.current.forEach((p) => {
      p.life += dt;
      if (p.life >= p.max) return;
      living += 1;
      p.vy += 620 * s; // gravidade
      p.vx *= 0.99;
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.rot += p.vr * s;

      const k = p.life / p.max;
      ctx.save();
      ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot)));
      ctx.restore();
    });
    if (!living) alive.current = false;
  });

  return <canvas ref={ref} className="pod-confetti" aria-hidden />;
}

/* ---------- Degrau ---------- */

const iniciais = (nome) =>
  String(nome || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();

function Avatar({ p, rank, fotos }) {
  const id = p.id || slug(p.nome);
  const v = fotos?.[id];
  const [quebrou, setQuebrou] = useState(false);
  const mostra = v && !quebrou;
  return (
    <div className={`pod-face ${mostra ? "has-foto" : ""}`}>
      <span className="pod-ring" aria-hidden />
      {mostra ? (
        <img src={`/api/foto/${id}?v=${v}`} alt="" onError={() => setQuebrou(true)} />
      ) : (
        <span className="pod-ini" aria-hidden>
          {iniciais(p.nome)}
        </span>
      )}
    </div>
  );
}

function Degrau({ p, rank, brl, maxFat, fotos }) {
  const m = METAL[rank];
  const pct = Math.round((p.fat / (maxFat || 1)) * 100);
  return (
    <li className={`pod pod-${rank}`} style={{ "--metal-a": m.a, "--metal-b": m.b, "--metal-c": m.c, "--metal-glow": m.glow }}>
      <div className="pod-top">
        {rank === 1 ? <Confetti fireKey={p.nome} /> : null}
        {rank === 1 ? <Sparkles rank={rank} /> : null}
        <Crown rank={rank} />
        <Avatar p={p} rank={rank} fotos={fotos} />
        <strong className="pod-nome">{p.nome}</strong>
        {p.casa ? <small className="pod-casa">{p.casa}</small> : null}
        <em className="pod-fat">
          <Num value={p.fat} format={brl} ms={1400} />
        </em>
        <small className="pod-vendas">
          {p.vendas} vendas · {pct}% do topo
        </small>
      </div>
      <div className="pod-base">
        <span className="pod-rank">{rank}</span>
        <span className="pod-metal">{m.nome}</span>
      </div>
    </li>
  );
}

/* ---------- Podio ---------- */

export default function Podium({ equipe = [], brl, fotos, diagnostico }) {
  /* Conta da casa e recepcao faturam, mas nao sao pessoa: nao ganham coroa. */
  const gente = equipe.filter((p) => !isSystemName(p.nome));
  const top = gente.slice(0, 3);
  const resto = gente.slice(3, 8);
  const maxFat = Math.max(1, ...gente.map((p) => p.fat));
  const ordem = [top[1] && 2, top[0] && 1, top[2] && 3].filter(Boolean);

  /* Telao fica ligado o dia todo: o lider e comemorado de novo de tempos em tempos. */
  const [ciclo, setCiclo] = useState(0);
  useEffect(() => {
    if (prefersReduced()) return undefined;
    const t = setInterval(() => setCiclo((c) => c + 1), 45000);
    return () => clearInterval(t);
  }, []);

  /* Tela vazia num telao nao diz nada a quem passa. Aqui ela conta o que
     o robo trouxe, para o problema ser lido sem abrir o console. */
  if (!top.length) {
    return (
      <div className="tv-vazio">
        <strong>Ninguém no ranking deste recorte</strong>
        <p>{diagnostico}</p>
        <p className="tv-vazio-dica">
          {equipe.length
            ? "O robô trouxe vendas, mas só de contas da casa (recepção, financeiro), que não entram no pódio."
            : "O robô não trouxe venda de pessoa nenhuma neste mês. Tente outro mês ou 'Ano todo'."}
        </p>
      </div>
    );
  }

  return (
    <div className="podium-wrap">
      {/* A Filial tem uma vendedora so. Tres colunas com um degrau no meio
          parece defeito, entao o grid acompanha quantas pessoas existem. */}
      <ol className={`podium podium-${top.length}`}>
        {ordem.map((rank) => (
          <Degrau
            key={`${top[rank - 1].nome}-${rank === 1 ? ciclo : 0}`}
            p={top[rank - 1]}
            rank={rank}
            brl={brl}
            maxFat={maxFat}
            fotos={fotos}
          />
        ))}
      </ol>

      {resto.length ? (
        <ol className="tv-resto" start={4}>
          {resto.map((p, i) => (
            <li key={p.nome} style={{ animationDelay: `${900 + i * 110}ms` }}>
              <b>{i + 4}</b>
              <span>{p.nome}</span>
              <div className="track">
                <i style={{ width: `${(p.fat / maxFat) * 100}%`, animationDelay: `${1000 + i * 110}ms` }} />
              </div>
              <em>{brl(p.fat)}</em>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

/* Poeira luminosa no fundo do telao. Poucas particulas, bem devagar:
   da vida sem disputar atencao com o numero. */
export function Ambient() {
  const ref = useRef(null);
  const parts = useRef([]);
  const { w, h, dpr = 1 } = useCanvasSize(ref);

  useEffect(() => {
    if (!w || !h) return;
    parts.current = Array.from({ length: 34 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: 0.8 + Math.random() * 2.2,
      vx: (Math.random() - 0.5) * 7,
      vy: -(3 + Math.random() * 9),
      a: 0.12 + Math.random() * 0.3,
      ph: Math.random() * Math.PI * 2,
    }));
  }, [w, h]);

  useRaf((t, dt) => {
    const cv = ref.current;
    if (!cv || !w || !h) return;
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const s = dt / 1000;
    parts.current.forEach((p) => {
      p.x += p.vx * s;
      p.y += p.vy * s;
      if (p.y < -6) {
        p.y = h + 6;
        p.x = Math.random() * w;
      }
      if (p.x < -6) p.x = w + 6;
      if (p.x > w + 6) p.x = -6;
      ctx.globalAlpha = p.a * (0.55 + 0.45 * Math.sin(t / 900 + p.ph));
      ctx.fillStyle = "#8ee7ff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  return <canvas ref={ref} className="tv-ambient" aria-hidden />;
}
