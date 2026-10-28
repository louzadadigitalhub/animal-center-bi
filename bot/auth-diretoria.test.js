import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SignJWT, exportJWK, generateKeyPair } from "jose";

/* Supabase falso so com o JWKS, na maquina: o token e assinado aqui e
   conferido pelo mesmo caminho do servidor (jwtVerify pelo JWKS). */
const { publicKey, privateKey } = await generateKeyPair("ES256");
const jwk = { ...(await exportJWK(publicKey)), kid: "teste", alg: "ES256", use: "sig" };
const supabase = createServer((req, res) => {
  if (req.url === "/auth/v1/.well-known/jwks.json") {
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ keys: [jwk] }));
  }
  res.statusCode = 404;
  res.end();
});
await new Promise((ok) => supabase.listen(0, "127.0.0.1", ok));
const URL_SUPA = `http://127.0.0.1:${supabase.address().port}`;
test.after(() => supabase.close());

process.env.SUPABASE_URL = URL_SUPA;
process.env.DATA_DIR = await mkdtemp(join(tmpdir(), "auth-"));
process.env.ADMIN_EMAIL = "dona@ac.com";
const { emailDoToken, quemE } = await import("./auth-diretoria.js");

const assinar = (claims) =>
  new SignJWT({ role: "authenticated", aud: "authenticated", ...claims })
    .setProtectedHeader({ alg: "ES256", kid: "teste" })
    .setIssuer(`${URL_SUPA}/auth/v1`)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
const pedido = async (claims) => ({ headers: { authorization: `Bearer ${await assinar(claims)}` } });

test("token: so o e-mail do topo identifica a pessoa", async () => {
  const dona = await quemE(await pedido({ sub: "1", email: "dona@ac.com" }));
  assert.equal(dona.email, "dona@ac.com");
  assert.equal(dona.admin, true);
});

test("token: e-mail posto em user_metadata nao vale (a propria pessoa edita)", async () => {
  /* Sem e-mail no topo, user_metadata nao serve de substituto. */
  assert.equal(await quemE(await pedido({ sub: "2", user_metadata: { email: "dona@ac.com" } })), null);
  /* Com outro e-mail no topo, vale o do topo. */
  const intruso = await quemE(await pedido({ sub: "3", email: "intruso@x.com", user_metadata: { email: "dona@ac.com" } }));
  assert.equal(intruso.email, "intruso@x.com");
  assert.equal(intruso.admin, false);
  assert.deepEqual(intruso.paginas, []);
});

test("token: conta anonima nao entra", async () => {
  assert.equal(await quemE(await pedido({ sub: "4", email: "dona@ac.com", is_anonymous: true })), null);
});

test("token: e-mail que o token diz nao confirmado nao entra", async () => {
  assert.equal(await quemE(await pedido({ sub: "5", email: "dona@ac.com", email_confirmed_at: null })), null);
  assert.equal(await quemE(await pedido({ sub: "6", email: "dona@ac.com", email_verified: false })), null);
  const ok = await quemE(await pedido({ sub: "7", email: "dona@ac.com", email_confirmed_at: "2026-10-01T00:00:00Z" }));
  assert.equal(ok.admin, true);
});

test("token assinado por outra chave nao entra", async () => {
  const outra = await generateKeyPair("ES256");
  const falso = await new SignJWT({ email: "dona@ac.com" })
    .setProtectedHeader({ alg: "ES256", kid: "teste" })
    .setIssuer(`${URL_SUPA}/auth/v1`)
    .setExpirationTime("5m")
    .sign(outra.privateKey);
  assert.equal(await quemE({ headers: { authorization: `Bearer ${falso}` } }), null);
});

test("emailDoToken: regras sem rede", () => {
  assert.equal(emailDoToken({ email: " a@b.com " }), "a@b.com");
  assert.equal(emailDoToken({ user_metadata: { email: "a@b.com" } }), "");
  assert.equal(emailDoToken({ email: "a@b.com", is_anonymous: true }), "");
  assert.equal(emailDoToken({ email: "a@b.com", is_anonymous: false }), "a@b.com");
  assert.equal(emailDoToken({ email: "a@b.com", email_confirmed_at: "" }), "");
  assert.equal(emailDoToken({ email: ["a@b.com"] }), "");
  assert.equal(emailDoToken(null), "");
});
