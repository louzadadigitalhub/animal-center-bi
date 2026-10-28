import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";

/* Login do time por PIN (/eu). Os contadores de tentativa vivem no
   processo, entao os testes abaixo dependem da ordem: cada um usa pessoas
   e IPs proprios e o do limite geral fica por ultimo. */
const DIR = await mkdtemp(join(tmpdir(), "people-"));
process.env.DATA_DIR = DIR;
process.env.SESSION_SECRET = "segredo-so-do-teste";
const pessoas = Array.from({ length: 11 }, (_, i) => ({
  id: `pessoa-${i}`,
  nome: `Pessoa ${i}`,
  unit: "matriz",
  casa: "Animal Center",
  role: "vendedor",
  createdAt: "2026-10-01T00:00:00.000Z",
}));
await writeFile(join(DIR, "people.json"), JSON.stringify({ people: pessoas }));
const { clientIp, loginPerson, trocarPin, verifyPin } = await import("./people.js");
const PIN = "246813";
const ERRADO = "975310";
for (const p of pessoas) assert.equal((await trocarPin(p.id, PIN)).ok, true);

test("IP do limite vem de req.ip, nao do X-Forwarded-For que o cliente escreve", async () => {
  assert.equal(clientIp({ headers: { "x-forwarded-for": "6.6.6.6" }, ip: "10.0.0.7" }), "10.0.0.7");
  assert.equal(clientIp({ headers: { "x-forwarded-for": "6.6.6.6" }, socket: { remoteAddress: "10.0.0.8" } }), "10.0.0.8");
  /* Com trust proxy 1, como no server.js: o item que o cliente forjou fica
     de fora; vale o que o proxy acrescentou por ultimo. */
  const app = express();
  app.set("trust proxy", 1);
  app.get("/ip", (req, res) => res.json({ ip: clientIp(req) }));
  const srv = await new Promise((ok) => {
    const s = app.listen(0, "127.0.0.1", () => ok(s));
  });
  try {
    const r = await fetch(`http://127.0.0.1:${srv.address().port}/ip`, {
      headers: { "X-Forwarded-For": "6.6.6.6, 203.0.113.9" },
    });
    assert.equal((await r.json()).ip, "203.0.113.9");
  } finally {
    srv.close();
  }
});

test("PIN confere com scrypt assincrono: o servidor segue respondendo enquanto confere", async () => {
  const doc = JSON.parse(await readFile(join(DIR, "people.json"), "utf8"));
  const hash = doc.people.find((p) => p.id === "pessoa-9").pinHash;
  let voltas = 0;
  let parar = false;
  const girar = () => {
    if (parar) return;
    voltas += 1;
    setImmediate(girar);
  };
  setImmediate(girar);
  const certo = await verifyPin(PIN, hash);
  parar = true;
  assert.equal(certo, true);
  /* Sincrono, o scrypt rodaria inteiro antes de qualquer setImmediate. */
  assert.ok(voltas > 0, "o laco de eventos ficou parado durante o scrypt");
  assert.equal(await verifyPin(ERRADO, hash), false);
});

test("PIN certo entra; PIN errado nao", async () => {
  const ok = await loginPerson("pessoa-9", PIN, "10.9.9.9");
  assert.equal(ok.ok, true);
  assert.ok(ok.token);
  const nao = await loginPerson("pessoa-9", ERRADO, "10.9.9.9");
  assert.equal(nao.status, 401);
  /* Acerto limpa o contador do IP e da pessoa. */
  assert.equal((await loginPerson("pessoa-9", PIN, "10.9.9.9")).ok, true);
});

let falhasGerais = 1; // a do teste anterior

test("limite por pessoa: trocar de IP a cada tentativa nao adianta", async () => {
  for (let i = 0; i < 8; i += 1) {
    const r = await loginPerson("pessoa-0", ERRADO, `10.0.${i}.1`);
    assert.equal(r.status, 401);
    falhasGerais += 1;
  }
  /* Nem o PIN certo, de um IP novo, entra durante a janela. */
  const travada = await loginPerson("pessoa-0", PIN, "10.0.99.1");
  assert.equal(travada.status, 429);
  /* As outras pessoas seguem entrando. */
  assert.equal((await loginPerson("pessoa-1", PIN, "10.0.99.2")).ok, true);
});

test("limite por IP continua valendo, espalhando por pessoas diferentes", async () => {
  for (let i = 2; i < 10; i += 1) {
    assert.equal((await loginPerson(`pessoa-${i}`, ERRADO, "10.1.1.1")).status, 401);
    falhasGerais += 1;
  }
  assert.equal((await loginPerson("pessoa-1", PIN, "10.1.1.1")).status, 429);
});

test("rajada: muitos pedidos juntos para a mesma pessoa nao furam o limite", async () => {
  const respostas = await Promise.all(
    Array.from({ length: 30 }, (_, i) => loginPerson("pessoa-10", ERRADO, `10.4.${i}.1`))
  );
  const conferidos = respostas.filter((r) => r.status === 401).length;
  assert.equal(conferidos, 8);
  assert.equal(respostas.filter((r) => r.status === 429).length, 22);
  falhasGerais += conferidos;
});

test("limite geral: um pouco em cada pessoa, de IPs diferentes, tambem para", async () => {
  /* pessoa-2..9 ja tem 1 falha cada (teste anterior); cabem mais 6 em cada
     sem travar a pessoa. */
  let i = 0;
  while (falhasGerais < 50) {
    const id = `pessoa-${2 + (i % 8)}`;
    assert.equal((await loginPerson(id, ERRADO, `10.2.${i}.1`)).status, 401, `tentativa ${i}`);
    falhasGerais += 1;
    i += 1;
  }
  /* pessoa-1 nao tem falha nenhuma, IP novo, PIN certo: ainda assim espera. */
  assert.equal((await loginPerson("pessoa-1", PIN, "10.3.0.1")).status, 429);
});
