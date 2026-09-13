import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import {
  createHmac,
  randomBytes,
  randomInt,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "..", ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    if (!line.includes("=") || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}
const DATA_DIR = process.env.DATA_DIR || join(__dirname, "..", "data");

const PEOPLE_FILE = join(DATA_DIR, "people.json");
const PHOTO_DIR = join(DATA_DIR, "fotos");
const HIST_FILE = join(DATA_DIR, "vendas-hist.json");
const ACESSOS_FILE = join(DATA_DIR, "acessos.txt");
const SECRET_FILE = join(DATA_DIR, "session-secret.txt");
const VENDAS_FILE = join(DATA_DIR, "vendas.json");

const COOKIE = "ac_eu";
const SESSION_DAYS = 7;
const PIN_LEN = 6;

const SYSTEM_NAMES = new Set([
  "animal center",
  "financeiro center",
  "recepcao center",
  "sao cristovao animal center",
  "sao cristovao",
]);

const FILIAL_HINTS = [
  "cristovao",
  "cristóvão",
  "francine lagemann",
  "joao pedro",
  "joao silva",
  "lara spagnol",
  "tais scotta",
  "taís scotta",
  "greice",
];

const loginFails = new Map();

export function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function slug(s) {
  return norm(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isSystemName(nome) {
  const n = norm(nome);
  if (!n || n === "sem nome") return true;
  if (SYSTEM_NAMES.has(n)) return true;
  if (n.endsWith(" center") && n.split(" ").length <= 3) return true;
  return false;
}

function pick(row, keys) {
  const entries = Object.entries(row);
  for (const want of keys) {
    const w = norm(want);
    const hit = entries.find(([k]) => {
      const nk = norm(k);
      if (nk === w || nk.includes(w)) return true;
      if (w.includes(" ")) return false;
      return w.length >= 5 && nk.includes(w.slice(0, 5));
    });
    if (hit && String(hit[1]).trim()) return String(hit[1]).trim();
  }
  return "";
}

function money(s) {
  if (!s) return 0;
  const t = String(s).replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function parseDate(s) {
  const m = String(s).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return { d: Number(m[1]), m: Number(m[2]), y: Number(m[3]) };
}

function unitOf(row, user) {
  const blob = norm(
    [pick(row, ["unidade", "loja", "empresa", "filial"]), user].join(" ")
  );
  if (FILIAL_HINTS.some((h) => blob.includes(norm(h)))) return "filial";
  return "matriz";
}

function grupoOf(row) {
  const g = norm(pick(row, ["grupo", "categoria", "tipo", "grupo de produto"]));
  const p = norm(pick(row, ["produto", "servico", "serviço", "item", "descricao"]));
  const t = `${g} ${p}`;
  if (/intern/.test(t)) return "Internamento";
  if (/consult|retorno/.test(t)) return "Consultas";
  if (/exam/.test(t)) return "Exames";
  if (/cirurg/.test(t)) return "Cirurgias";
  if (/vacin/.test(t)) return "Vacinas";
  if (/farmac|medic|pet ?shop|produto/.test(t)) return "Farmacia";
  return "Procedimentos";
}

function saleKey(row) {
  return [
    pick(row, ["venda"]),
    pick(row, ["produto/servico", "produto/serviço", "produto"]),
    pick(row, ["data e hora", "data"]),
    pick(row, ["liquido", "lquido"]),
  ].join("|");
}

export function parseSales(rows) {
  return (rows || [])
    .map((row) => {
      const dt = parseDate(pick(row, ["data", "data da venda", "data e hora", "emissao"]));
      const valor = money(pick(row, ["liquido", "lquido", "quido", "valor liquido", "total", "bruto"]));
      const status = pick(row, ["status da venda", "status", "pago", "situacao"]);
      const user = pick(row, ["usuario", "usuário", "funcionario", "funcionário", "vendedor", "responsavel"]);
      return {
        dt,
        dtBaixa: parseDate(pick(row, ["data baixa"])),
        recebido: /baix/.test(norm(status)),
        status,
        valor,
        user,
        cliente: pick(row, ["cliente", "tutor"]),
        venda: pick(row, ["venda"]),
        produto: pick(row, ["produto/servico", "produto/serviço", "produto"]),
        unit: unitOf(row, user),
        grupo: grupoOf(row),
        key: saleKey(row),
      };
    })
    .filter((r) => r.dt && r.valor);
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

export async function loadSalesRows() {
  const hist = await readJson(HIST_FILE, null);
  if (Array.isArray(hist) && hist.length) return hist;
  const cur = await readJson(VENDAS_FILE, []);
  return Array.isArray(cur) ? cur : [];
}

/* Linhas ja parseadas, guardadas na memoria e refeitas so quando o arquivo
   muda de verdade.

   Antes, cada troca de mes no painel da vendedora relia o historico do disco
   e reparsava tudo: ~5,8 s por clique com as 99 mil linhas da VPS. O robo
   reescreve o arquivo a cada 2 minutos, entao entre duas raspagens o
   resultado e sempre o mesmo — refazer a cada clique era trabalho jogado
   fora.

   A chave e o mtime dos dois arquivos: se o robo gravou, o cache cai
   sozinho, sem prazo chutado. */
let cacheVendas = { assinatura: null, linhas: null };

async function assinaturaArquivos() {
  const marca = async (f) => {
    try {
      const st = await stat(f);
      return `${st.mtimeMs}:${st.size}`;
    } catch {
      return "0";
    }
  };
  return `${await marca(HIST_FILE)}|${await marca(VENDAS_FILE)}`;
}

export async function vendasParseadas() {
  const assinatura = await assinaturaArquivos();
  if (cacheVendas.assinatura === assinatura && cacheVendas.linhas) return cacheVendas.linhas;
  const linhas = parseSales(await loadSalesRows());
  cacheVendas = { assinatura, linhas };
  return linhas;
}

export async function mergeSalesHistory(rows) {
  if (!Array.isArray(rows) || !rows.length) return { added: 0, total: 0 };
  await mkdir(DATA_DIR, { recursive: true });
  const prev = await readJson(HIST_FILE, []);
  const map = new Map();
  for (const row of Array.isArray(prev) ? prev : []) {
    map.set(saleKey(row), row);
  }
  let added = 0;
  for (const row of rows) {
    const k = saleKey(row);
    if (!map.has(k)) added += 1;
    map.set(k, row);
  }
  const merged = [...map.values()];
  await writeFile(HIST_FILE, JSON.stringify(merged));
  return { added, total: merged.length };
}

async function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (existsSync(SECRET_FILE)) return (await readFile(SECRET_FILE, "utf8")).trim();
  const s = randomBytes(32).toString("hex");
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(SECRET_FILE, s, { mode: 0o600 });
  return s;
}

function hashPin(pin) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(pin), salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPin(pin, stored) {
  if (!stored || !String(stored).includes(":")) return false;
  const [salt, hash] = String(stored).split(":");
  const test = scryptSync(String(pin), salt, 32);
  const a = Buffer.from(hash, "hex");
  if (a.length !== test.length) return false;
  return timingSafeEqual(a, test);
}

function newPin() {
  return String(randomInt(0, 10 ** PIN_LEN)).padStart(PIN_LEN, "0");
}

async function loadPeopleDoc() {
  const doc = await readJson(PEOPLE_FILE, { people: [] });
  if (!Array.isArray(doc.people)) doc.people = [];
  return doc;
}

async function savePeopleDoc(doc) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(PEOPLE_FILE, JSON.stringify(doc, null, 2));
}

function casaLabel(unit) {
  return unit === "filial" ? "Sao Cristovao" : "Animal Center";
}

export async function syncPeopleFromSales() {
  const cur = await readJson(VENDAS_FILE, []);
  if (Array.isArray(cur) && cur.length) {
    try {
      await mergeSalesHistory(cur);
    } catch {
      /* o painel principal nao depende deste arquivo */
    }
  }
  const rows = await vendasParseadas();
  const byUser = new Map();
  for (const r of rows) {
    if (!r.user || isSystemName(r.user)) continue;
    const id = slug(r.user);
    if (!id) continue;
    const cur = byUser.get(id) || { id, nome: r.user, unit: r.unit, n: 0, fat: 0 };
    cur.n += 1;
    cur.fat += r.valor;
    if (r.unit === "filial") cur.unit = "filial";
    byUser.set(id, cur);
  }

  const doc = await loadPeopleDoc();
  const known = new Map(doc.people.map((p) => [p.id, p]));
  const created = [];

  for (const src of byUser.values()) {
    if (known.has(src.id)) {
      const p = known.get(src.id);
      p.nome = src.nome;
      p.unit = src.unit;
      p.casa = casaLabel(src.unit);
      continue;
    }
    const pin = newPin();
    const person = {
      id: src.id,
      nome: src.nome,
      unit: src.unit,
      casa: casaLabel(src.unit),
      role: "vendedor",
      pinHash: hashPin(pin),
      createdAt: new Date().toISOString(),
    };
    known.set(src.id, person);
    created.push({ ...person, pin });
  }

  doc.people = [...known.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
  doc.updatedAt = new Date().toISOString();
  await savePeopleDoc(doc);

  if (created.length) {
    const lines = [
      "Animal Center — acessos do time (nao envie no grupo do WhatsApp)",
      `Atualizado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
      "Endereco: /eu",
      "",
    ];
    if (existsSync(ACESSOS_FILE)) {
      try {
        const old = await readFile(ACESSOS_FILE, "utf8");
        if (old.trim()) lines.push("--- anteriores ---", old.trim(), "", "--- novos ---");
      } catch {
        /* ignore */
      }
    }
    for (const p of created) {
      lines.push(`${p.nome.padEnd(28)}  PIN ${p.pin}  ${p.casa}`);
    }
    lines.push("");
    await writeFile(ACESSOS_FILE, lines.join("\n"), { mode: 0o600 });
  }

  return { people: doc.people, created };
}

export function publicStaff(people) {
  return people.map((p) => ({
    id: p.id,
    nome: p.nome,
    casa: p.casa,
    unit: p.unit,
    foto: p.foto?.v || null,
  }));
}

/* ---------- Fotos ----------
   O tipo vem do conteudo, nao do header nem da extensao que o cliente mandou.
   SVG fica de fora de proposito: e XML, pode carregar script, e a foto
   aparece num telao publico. */

const MAGIC = [
  {
    ext: "jpg",
    type: "image/jpeg",
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: "png",
    type: "image/png",
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    ext: "webp",
    type: "image/webp",
    test: (b) =>
      b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
  },
];

export function sniffImage(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 16) return null;
  return MAGIC.find((m) => m.test(buf)) || null;
}

/* O nome do arquivo sai do id da sessao (ja e slug: [a-z0-9-]).
   Nada que o cliente mande entra no caminho. */
function photoPath(id, ext) {
  const safe = slug(id);
  if (!safe) return null;
  return join(PHOTO_DIR, `${safe}.${ext}`);
}

export async function savePhoto(id, buf) {
  const kind = sniffImage(buf);
  if (!kind) return { ok: false, error: "manda JPG, PNG ou WebP" };
  const doc = await loadPeopleDoc();
  const person = doc.people.find((p) => p.id === id);
  if (!person) return { ok: false, error: "pessoa nao encontrada" };
  const dest = photoPath(id, kind.ext);
  if (!dest) return { ok: false, error: "id invalido" };
  await mkdir(PHOTO_DIR, { recursive: true });
  // troca de formato nao pode deixar o arquivo antigo para tras
  await Promise.all(MAGIC.map((m) => rm(photoPath(id, m.ext), { force: true })));
  await writeFile(dest, buf);
  person.foto = { ext: kind.ext, v: Date.now() };
  await savePeopleDoc(doc);
  return { ok: true, foto: person.foto.v };
}

export async function removePhoto(id) {
  const doc = await loadPeopleDoc();
  const person = doc.people.find((p) => p.id === id);
  if (!person) return { ok: false, error: "pessoa nao encontrada" };
  await Promise.all(MAGIC.map((m) => rm(photoPath(id, m.ext), { force: true })));
  delete person.foto;
  await savePeopleDoc(doc);
  return { ok: true };
}

export async function photoFile(id) {
  const doc = await loadPeopleDoc();
  const person = doc.people.find((p) => p.id === id);
  if (!person?.foto) return null;
  const kind = MAGIC.find((m) => m.ext === person.foto.ext);
  const path = kind && photoPath(id, kind.ext);
  return path ? { path, type: kind.type, v: person.foto.v } : null;
}

/* Mapa id -> versao. Vai no snapshot para a TV saber quem tem foto
   sem disparar um 404 por pessoa. */
export async function photoMap() {
  const doc = await loadPeopleDoc();
  const out = {};
  for (const p of doc.people) if (p.foto?.v) out[p.id] = p.foto.v;
  return out;
}

function tooManyFails(ip) {
  const row = loginFails.get(ip);
  if (!row) return false;
  if (Date.now() - row.t > 15 * 60 * 1000) {
    loginFails.delete(ip);
    return false;
  }
  return row.n >= 8;
}

function markFail(ip) {
  const row = loginFails.get(ip) || { n: 0, t: Date.now() };
  row.n += 1;
  row.t = Date.now();
  loginFails.set(ip, row);
}

function clearFail(ip) {
  loginFails.delete(ip);
}

export async function loginPerson(id, pin, ip) {
  if (tooManyFails(ip)) {
    return { ok: false, status: 429, error: "muitas tentativas — espere 15 minutos" };
  }
  const cleanId = slug(id);
  const cleanPin = String(pin || "").replace(/\D/g, "");
  if (!cleanId || cleanPin.length < 4 || cleanPin.length > 8) {
    markFail(ip);
    return { ok: false, status: 401, error: "nome ou PIN incorreto" };
  }
  const doc = await loadPeopleDoc();
  const person = doc.people.find((p) => p.id === cleanId);
  if (!person || !verifyPin(cleanPin, person.pinHash)) {
    markFail(ip);
    return { ok: false, status: 401, error: "nome ou PIN incorreto" };
  }
  clearFail(ip);
  const token = await signSession(person);
  return {
    ok: true,
    token,
    me: { id: person.id, nome: person.nome, casa: person.casa, unit: person.unit, role: person.role },
  };
}

async function signSession(person) {
  const secret = await sessionSecret();
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ id: person.id, exp }), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export async function readSession(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  const secret = await sessionSecret();
  const expect = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!data?.id || !data?.exp || Date.now() > Number(data.exp)) return null;
  const doc = await loadPeopleDoc();
  const person = doc.people.find((p) => p.id === data.id);
  if (!person) return null;
  return { id: person.id, nome: person.nome, casa: person.casa, unit: person.unit, role: person.role, foto: person.foto?.v || null };
}

export function cookieHeader(token, req) {
  const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const secure = proto === "https" || process.env.COOKIE_SECURE === "1";
  const parts = [
    `${COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookieHeader() {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readCookie(req) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i) === COOKIE) return decodeURIComponent(part.slice(i + 1));
  }
  return "";
}

function inPeriod(r, year, month) {
  if (r.dt.y !== year) return false;
  if (month !== "all" && r.dt.m !== month + 1) return false;
  return true;
}

function shiftMonth(year, month, delta) {
  const d = new Date(Date.UTC(year, month + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

function summarize(list) {
  const fatVenda = list.reduce((a, r) => a + r.valor, 0);
  const recebido = list.filter((r) => r.recebido).reduce((a, r) => a + r.valor, 0);
  const clientes = new Set(list.map((r) => r.cliente).filter(Boolean));
  const vendas = new Set(list.map((r) => r.venda).filter(Boolean));
  const byGrupo = {};
  const byDay = {};
  for (const r of list) {
    byGrupo[r.grupo] = (byGrupo[r.grupo] || 0) + r.valor;
    byDay[r.dt.d] = (byDay[r.dt.d] || 0) + r.valor;
  }
  const gruposNomes = [
    "Internamento",
    "Consultas",
    "Exames",
    "Cirurgias",
    "Farmacia",
    "Vacinas",
    "Procedimentos",
  ];
  const qtd = list.length;
  return {
    fat: Math.round(fatVenda),
    recebido: Math.round(recebido),
    qtd,
    vendas: vendas.size || qtd,
    clientes: clientes.size,
    ticket: qtd ? Math.round(fatVenda / qtd) : 0,
    ticketCliente: clientes.size ? Math.round(fatVenda / clientes.size) : 0,
    consultas: list.filter((r) => r.grupo === "Consultas").length,
    vacinas: list.filter((r) => r.grupo === "Vacinas").length,
    cirurgias: list.filter((r) => r.grupo === "Cirurgias").length,
    grupos: gruposNomes.map((nome) => ({ nome, valor: Math.round(byGrupo[nome] || 0) })),
    daily: Object.keys(byDay)
      .map(Number)
      .sort((a, b) => a - b)
      .map((d) => ({ d, fat: Math.round(byDay[d]) })),
  };
}

function deltaPct(now, prev) {
  if (!prev) return null;
  return Math.round(((now - prev) / prev) * 100);
}

export async function personDashboard(nome, year, month) {
  const parsed = await vendasParseadas();
  const mine = parsed.filter((r) => norm(r.user) === norm(nome));
  const cur = mine.filter((r) => inPeriod(r, year, month));
  const prevM = month === "all" ? null : shiftMonth(year, month, -1);
  const prev = prevM ? mine.filter((r) => inPeriod(r, prevM.year, prevM.month)) : [];
  const yearAgo = mine.filter((r) => inPeriod(r, year - 1, month));
  const nowS = summarize(cur);
  const prevS = summarize(prev);
  const agoS = summarize(yearAgo);

  /* Uma passada em vez de doze: o filter dentro do Array.from varria a lista
     inteira uma vez por mes. */
  const monthly = Array(12).fill(0);
  for (const r of mine) {
    if (r.dt?.y === year && r.dt.m >= 1 && r.dt.m <= 12) monthly[r.dt.m - 1] += r.valor;
  }
  for (let m = 0; m < 12; m += 1) monthly[m] = Math.round(monthly[m]);
  const monthsWithData = new Set(mine.map((r) => `${r.dt.y}-${r.dt.m}`));

  return {
    nome,
    year,
    month,
    temHistorico: monthsWithData.size > 1,
    mesesNoCofre: [...monthsWithData].sort(),
    atual: nowS,
    anterior: prevM
      ? { year: prevM.year, month: prevM.month, ...prevS, vs: deltaPct(nowS.fat, prevS.fat) }
      : null,
    anoPassado: { year: year - 1, month, ...agoS, vs: deltaPct(nowS.fat, agoS.fat) },
    monthlyFat: monthly,
  };
}

export function clientIp(req) {
  const xf = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  return xf || req.ip || "local";
}
