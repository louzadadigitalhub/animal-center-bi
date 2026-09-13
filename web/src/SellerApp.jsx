import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight } from "@phosphor-icons/react/ArrowUpRight";
import { ArrowDownRight } from "@phosphor-icons/react/ArrowDownRight";
import { SignOut } from "@phosphor-icons/react/SignOut";
import { UserCircle } from "@phosphor-icons/react/UserCircle";
import { LockKey } from "@phosphor-icons/react/LockKey";
import { Toaster, sileo } from "sileo";
import "sileo/styles.css";
import "./seller.css";

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const brl = (n) =>
  (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const num = (n) => (Number(n) || 0).toLocaleString("pt-BR");

function firstName(nome) {
  return String(nome || "").split(" ")[0] || "você";
}

function iniciais(nome) {
  return String(nome || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
}

function Delta({ value }) {
  if (value == null) return <span className="seller-muted">sem base ainda</span>;
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={up ? "seller-up" : "seller-down"}>
      <Icon weight="bold" />
      {up ? "+" : ""}
      {value}%
    </span>
  );
}

function Bars({ rows, maxHint }) {
  const max = Math.max(1, maxHint || 0, ...rows.map((r) => r.fat || 0));
  if (!rows.length) return <p className="seller-empty">Nada neste recorte.</p>;
  return (
    <ol className="seller-bars">
      {rows.map((r) => (
        <li key={r.d}>
          <span>{r.label || r.d}</span>
          <i style={{ width: `${Math.max(4, (r.fat / max) * 100)}%` }} />
          <b>{brl(r.fat)}</b>
        </li>
      ))}
    </ol>
  );
}

export default function SellerApp() {
  const now = new Date();
  const br = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const [staff, setStaff] = useState([]);
  const [me, setMe] = useState(null);
  const [view, setView] = useState(null);
  const [id, setId] = useState("");
  const [pin, setPin] = useState("");
  const [year, setYear] = useState(br.getFullYear());
  const [month, setMonth] = useState(br.getMonth());
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [boot, setBoot] = useState(true);
  const [carregando, setCarregando] = useState(false);

  /* Cada recorte ja visto fica guardado, entao voltar para um mes anterior
     e instantaneo em vez de nova ida ao servidor. */
  const cache = useRef(new Map());

  async function loadMe(y = year, m = month) {
    const chave = `${y}|${m}`;
    const guardado = cache.current.get(chave);
    if (guardado) {
      setMe(guardado.me);
      setView(guardado.view);
    }
    /* Sem nada guardado a tela segue mostrando o recorte anterior, marcado
       como carregando. Zerar faria o numero piscar e voltar diferente, o que
       parece defeito. */
    setCarregando(!guardado);
    try {
      const r = await fetch(`/api/me/dashboard?year=${y}&month=${m}`, { credentials: "include" });
      if (r.status === 401) {
        setMe(null);
        setView(null);
        return false;
      }
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || "falhou");
      cache.current.set(chave, { me: data.me, view: data.view });
      if (cache.current.size > 14) cache.current.delete(cache.current.keys().next().value);
      setMe(data.me);
      setView(data.view);
      return true;
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const s = await fetch("/api/auth/staff").then((r) => r.json());
        if (s.ok) {
          setStaff(s.staff || []);
          if (!id && s.staff?.[0]) setId(s.staff[0].id);
        }
        await loadMe();
      } catch {
        /* login na tela */
      } finally {
        setBoot(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!me) return;
    loadMe(year, month).catch((e) => setErr(e.message));
  }, [year, month]);

  async function onLogin(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, pin }),
      });
      const data = await r.json();
      if (!data.ok) throw new Error(data.error || "nao entrou");
      setPin("");
      await loadMe(year, month);
      sileo.success({ title: `Oi, ${firstName(staff.find((p) => p.id === id)?.nome)}` });
    } catch (e2) {
      const msg = e2.message || "nao entrou";
      setErr(msg);
      sileo.error({ title: "Não entrou", description: msg });
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setMe(null);
    setView(null);
  }

  const dailyRows = useMemo(() => (view?.atual?.daily || []).map((d) => ({ d: `dia ${d.d}`, fat: d.fat })), [view]);
  const monthRows = useMemo(
    () => (view?.monthlyFat || []).map((fat, i) => ({ d: MONTHS[i], fat })).filter((r) => r.fat > 0),
    [view]
  );

  if (boot) {
    return (
      <div className="seller">
        <p className="seller-boot">Abrindo seu painel…</p>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="seller">
        <Toaster position="top-center" offset={{ top: 16 }} />
        <form className="seller-card seller-login" onSubmit={onLogin}>
          <p className="seller-kicker">Animal Center</p>
          <h1>Seu painel</h1>
          <p className="seller-lead">Só os seus números. Ninguém do time vê o do outro.</p>

          <label>
            Quem é você
            <span>
              <UserCircle />
              <select value={id} onChange={(e) => setId(e.target.value)} required>
                {staff.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} · {p.casa}
                  </option>
                ))}
              </select>
            </span>
          </label>

          <label>
            PIN de 6 números
            <span>
              <LockKey />
              <input
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="••••••"
                required
              />
            </span>
          </label>

          {err ? <p className="seller-err">{err}</p> : null}
          <button type="submit" disabled={busy || !id || pin.length < 4}>
            {busy ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </div>
    );
  }

  const a = view?.atual;
  const period = month === "all" ? `Ano ${year}` : `${MONTHS[month]} ${year}`;

  return (
    <div className="seller" data-carregando={carregando ? "1" : undefined} aria-busy={carregando}>
      <Toaster position="top-center" offset={{ top: 16 }} />
      <header className="seller-top">
        <div>
          <p>Olá, {firstName(me.nome)}</p>
          <strong>{me.nome}</strong>
          <small>{me.casa}</small>
        </div>
        <button
          type="button"
          className="seller-out"
          onClick={() => {
            onLogout();
            sileo.info({ title: "Você saiu" });
          }}
        >
          <SignOut />
          Sair
        </button>
      </header>

      <div className="seller-filters">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[2024, 2025, 2026].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS.map((label, i) => (
            <option key={label} value={i}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <section className="seller-kpis">
        <article>
          <p>Suas vendas · {period}</p>
          <strong>{brl(a?.fat)}</strong>
          <small>
            vs mês anterior <Delta value={view?.anterior?.vs} />
          </small>
        </article>
        <article>
          <p>Já recebido</p>
          <strong>{brl(a?.recebido)}</strong>
          <small>{num(a?.qtd)} itens · ticket {brl(a?.ticket)}</small>
        </article>
        <article>
          <p>Clientes</p>
          <strong>{num(a?.clientes)}</strong>
          <small>
            {num(a?.consultas)} consultas · {num(a?.vacinas)} vacinas
          </small>
        </article>
      </section>

      <section className="seller-card">
        <h2>Comparativo</h2>
        <ul className="seller-cmp">
          <li>
            <span>Este recorte</span>
            <b>{brl(a?.fat)}</b>
          </li>
          <li>
            <span>
              Mês anterior
              {view?.anterior ? ` (${MONTHS[view.anterior.month]} ${view.anterior.year})` : ""}
            </span>
            <b>{brl(view?.anterior?.fat)}</b>
            <Delta value={view?.anterior?.vs} />
          </li>
          <li>
            <span>Mesmo mês no ano passado</span>
            <b>{brl(view?.anoPassado?.fat)}</b>
            <Delta value={view?.anoPassado?.vs} />
          </li>
        </ul>
        {!view?.temHistorico ? (
          <p className="seller-note">
            O robô ainda tem só o mês atual no cofre. O comparativo com meses anteriores
            entra sozinho quando houver mais meses puxados do Vet.
          </p>
        ) : null}
      </section>

      <section className="seller-card">
        <h2>Por dia</h2>
        <Bars rows={dailyRows} />
      </section>

      <section className="seller-card">
        <h2>Por grupo</h2>
        <Bars
          rows={(a?.grupos || []).filter((g) => g.valor).map((g) => ({ d: g.nome, fat: g.valor }))}
        />
      </section>

      <section className="seller-card">
        <h2>Meses de {year}</h2>
        <Bars rows={monthRows} />
      </section>
    </div>
  );
}
