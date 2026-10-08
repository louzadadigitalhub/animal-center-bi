import test from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = "https://exemplo.supabase.co";
process.env.SUPABASE_SECRET_KEY = "sb_secret_teste";
const { criarConta, definirSenha, listarUsuarios } = await import("./contas.js");

/* Supabase falso: guarda as chamadas e responde como a API de admin. */
function falso(usuarios = []) {
  const chamadas = [];
  globalThis.fetch = async (url, op = {}) => {
    const corpo = op.body ? JSON.parse(op.body) : null;
    chamadas.push({ url: String(url), metodo: op.method || "GET", corpo, chave: op.headers?.apikey });
    const u = new URL(url);
    const resp = (status, j) => ({ ok: status < 300, status, json: async () => j });
    if (u.pathname === "/auth/v1/admin/users" && (op.method || "GET") === "GET") return resp(200, { users: usuarios });
    if (u.pathname === "/auth/v1/admin/users" && op.method === "POST") {
      if (usuarios.some((x) => x.email === corpo.email)) return resp(422, { msg: "A user with this email address has already been registered" });
      return resp(200, { id: "novo-id", email: corpo.email });
    }
    if (u.pathname.startsWith("/auth/v1/admin/users/") && op.method === "PUT") return resp(200, { id: u.pathname.split("/").pop() });
    return resp(404, { msg: "nao achou" });
  };
  return chamadas;
}

test("criar conta: nasce confirmada, com a senha que a admin deu", async () => {
  const ch = falso();
  const r = await criarConta("  Fulana@AnimalCenter.com ", "provisoria1");
  assert.equal(r.ok, true);
  const post = ch.find((c) => c.metodo === "POST");
  assert.deepEqual(post.corpo, { email: "fulana@animalcenter.com", password: "provisoria1", email_confirm: true });
  assert.equal(post.chave, "sb_secret_teste");
});

test("criar conta: senha curta nem sai daqui; e-mail repetido vira aviso claro", async () => {
  const ch = falso([{ id: "1", email: "ja@tem.com" }]);
  assert.equal((await criarConta("a@b.com", "curta")).ok, false);
  assert.equal(ch.length, 0);
  const r = await criarConta("ja@tem.com", "provisoria1");
  assert.equal(r.ok, false);
  assert.equal(r.status, 409);
  assert.match(r.error, /ja tem conta/);
});

test("trocar senha: acha a conta pelo e-mail e troca pelo id", async () => {
  const ch = falso([{ id: "abc", email: "fulana@animalcenter.com", last_sign_in_at: "2026-10-07T10:00:00Z" }]);
  const r = await definirSenha("FULANA@animalcenter.com", "outrasenha9");
  assert.equal(r.ok, true);
  const put = ch.find((c) => c.metodo === "PUT");
  assert.match(put.url, /\/auth\/v1\/admin\/users\/abc$/);
  assert.deepEqual(put.corpo, { password: "outrasenha9" });
  const nao = await definirSenha("ninguem@x.com", "outrasenha9");
  assert.equal(nao.ok, false);
  assert.equal(nao.status, 404);
});

test("listar usuarios traz e-mail e ultimo acesso", async () => {
  falso([{ id: "abc", email: "Fulana@AnimalCenter.com", last_sign_in_at: "2026-10-07T10:00:00Z", created_at: "2026-09-01T00:00:00Z" }]);
  const r = await listarUsuarios();
  assert.deepEqual(r.usuarios, [{ id: "abc", email: "fulana@animalcenter.com", ultimoAcesso: "2026-10-07T10:00:00Z", criadoEm: "2026-09-01T00:00:00Z" }]);
});
