import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* Primeira admin e perfis.json ilegivel. Antes, qualquer erro ao ler o
   arquivo virava "sem admins", e o proximo e-mail que entrasse ganhava
   todas as abas. */
const DIR = await mkdtemp(join(tmpdir(), "acesso-admin-"));
process.env.DATA_DIR = DIR;
delete process.env.ADMIN_EMAIL;
const ARQ = join(DIR, "perfis.json");
const { definirAdmin, emailsDoPainel, listarPerfis, perfilDe, salvarPerfil } = await import("./acesso.js");
const limpar = () => rm(ARQ, { recursive: true, force: true });

test("painel novo sem ADMIN_EMAIL: o primeiro login nao vira admin", async () => {
  await limpar();
  delete process.env.ADMIN_EMAIL;
  const p = await perfilDe("primeiro@qualquer.com");
  assert.equal(p.admin, false);
  assert.deepEqual(p.paginas, []);
  assert.equal(existsSync(ARQ), false);
});

test("painel novo com ADMIN_EMAIL: so esse e-mail vira a primeira admin", async () => {
  await limpar();
  process.env.ADMIN_EMAIL = " Dona@AC.com ";
  const intruso = await perfilDe("intruso@qualquer.com");
  assert.equal(intruso.admin, false);
  assert.deepEqual(intruso.paginas, []);
  const dona = await perfilDe("dona@ac.com");
  assert.equal(dona.admin, true);
  assert.equal(dona.paginas, "todas");
  const doc = JSON.parse(await readFile(ARQ, "utf8"));
  assert.deepEqual(doc.admins, ["dona@ac.com"]);
  assert.equal((await stat(ARQ)).mode & 0o777, 0o600);
  /* Ja tem admin: mudar ADMIN_EMAIL nao cria outra. */
  process.env.ADMIN_EMAIL = "outra@ac.com";
  assert.equal((await perfilDe("outra@ac.com")).admin, false);
});

test("perfis.json corrompido: nega todo mundo, inclusive ADMIN_EMAIL, e nao grava por cima", async () => {
  process.env.ADMIN_EMAIL = "dona@ac.com";
  const quebrado = '{"admins": ["dona@ac.com"], "perfis": {"gerente@ac.com": {"pagi';
  await writeFile(ARQ, quebrado);
  assert.equal(await perfilDe("dona@ac.com"), null);
  assert.equal(await perfilDe("qualquer@x.com"), null);
  assert.equal((await salvarPerfil("qualquer@x.com", "todas")).ok, false);
  assert.equal((await definirAdmin("qualquer@x.com", true)).ok, false);
  assert.deepEqual(await listarPerfis(), []);
  assert.equal((await emailsDoPainel()).size, 0);
  assert.equal(await readFile(ARQ, "utf8"), quebrado);
});

test("perfis.json com formato estranho (admins nao e lista): nega", async () => {
  process.env.ADMIN_EMAIL = "dona@ac.com";
  await writeFile(ARQ, JSON.stringify({ admins: "dona@ac.com", perfis: {} }));
  assert.equal(await perfilDe("dona@ac.com"), null);
  await writeFile(ARQ, "null");
  assert.equal(await perfilDe("dona@ac.com"), null);
});

test("erro de leitura que nao e 'arquivo nao existe': nega", async () => {
  await limpar();
  process.env.ADMIN_EMAIL = "dona@ac.com";
  await mkdir(ARQ); // ler um diretorio da EISDIR
  assert.equal(await perfilDe("dona@ac.com"), null);
  assert.equal((await salvarPerfil("x@ac.com", ["vendas"])).ok, false);
  await limpar();
});

test("gravacao atomica: arquivo novo entra pelo rename e nao sobra .tmp", async () => {
  await limpar();
  process.env.ADMIN_EMAIL = "dona@ac.com";
  await perfilDe("dona@ac.com");
  const antes = (await stat(ARQ)).ino;
  assert.equal((await salvarPerfil("gerente@ac.com", ["vendas"])).ok, true);
  /* writeFile por cima mantem o inode; rename de um arquivo novo troca. */
  assert.notEqual((await stat(ARQ)).ino, antes);
  assert.equal((await stat(ARQ)).mode & 0o777, 0o600);
  assert.deepEqual((await readdir(DIR)).filter((f) => f.endsWith(".tmp")), []);
  assert.deepEqual(JSON.parse(await readFile(ARQ, "utf8")).perfis["gerente@ac.com"].paginas, ["vendas"]);
  assert.deepEqual([...(await emailsDoPainel())].sort(), ["dona@ac.com", "gerente@ac.com"]);
});
