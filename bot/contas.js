/* Contas do painel no Supabase: listar, criar e trocar senha.

   A chave de servico (SUPABASE_SECRET_KEY) cria conta e troca a senha de
   qualquer um, entao so existe aqui no servidor e nunca vai para o
   navegador. Quem pode chamar isto e decidido nas rotas, com
   exigeDiretoria({ admin: true }). As permissoes continuam em acesso.js. */

const MIN_SENHA = 8;

function config() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const chave = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return url && chave ? { url, chave } : null;
}

async function admin(caminho, { method = "GET", body } = {}) {
  const c = config();
  if (!c) return { ok: false, status: 503, error: "falta SUPABASE_SECRET_KEY no servidor" };
  let r;
  try {
    r = await fetch(`${c.url}/auth/v1/admin/${caminho}`, {
      method,
      headers: { "Content-Type": "application/json", apikey: c.chave, Authorization: `Bearer ${c.chave}` },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    return { ok: false, status: 502, error: "nao deu para falar com o Supabase" };
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j.msg || j.message || j.error_description || j.error || `Supabase respondeu ${r.status}`;
    return { ok: false, status: r.status, error: String(msg) };
  }
  return { ok: true, dados: j };
}

const norm = (email) => String(email || "").trim().toLowerCase();

export function senhaFraca(senha) {
  return String(senha || "").length < MIN_SENHA ? `use ao menos ${MIN_SENHA} caracteres` : "";
}

export async function listarUsuarios() {
  const usuarios = [];
  for (let page = 1; page <= 20; page++) {
    const r = await admin(`users?page=${page}&per_page=200`);
    if (!r.ok) return r;
    const lote = r.dados.users || [];
    for (const u of lote) {
      usuarios.push({ id: u.id, email: norm(u.email), ultimoAcesso: u.last_sign_in_at || null, criadoEm: u.created_at || null });
    }
    if (lote.length < 200) break;
  }
  return { ok: true, usuarios };
}

/* email_confirm: quem cria e a admin, entao a conta ja nasce confirmada e
   entra sem depender de e-mail nenhum chegar. */
export async function criarConta(email, senha) {
  const fraca = senhaFraca(senha);
  if (fraca) return { ok: false, status: 400, error: fraca };
  const r = await admin("users", { method: "POST", body: { email: norm(email), password: senha, email_confirm: true } });
  if (!r.ok && /already|registered|exists/i.test(r.error)) {
    return { ok: false, status: 409, error: "esse e-mail ja tem conta: use Trocar senha" };
  }
  return r.ok ? { ok: true, id: r.dados.id } : r;
}

export async function definirSenha(email, senha) {
  const fraca = senhaFraca(senha);
  if (fraca) return { ok: false, status: 400, error: fraca };
  const lista = await listarUsuarios();
  if (!lista.ok) return lista;
  const u = lista.usuarios.find((x) => x.email === norm(email));
  if (!u) return { ok: false, status: 404, error: "esse e-mail nao tem conta no painel" };
  const r = await admin(`users/${u.id}`, { method: "PUT", body: { password: senha } });
  return r.ok ? { ok: true } : r;
}
