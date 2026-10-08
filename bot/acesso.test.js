import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DATA_DIR = await mkdtemp(join(tmpdir(), "acesso-"));
const { definirAdmin, listarPerfis, marcarSenhaProvisoria, perfilDe, salvarPerfil } = await import("./acesso.js");

test("admin: dá para tornar e tirar, mas sempre fica uma", async () => {
  assert.equal((await perfilDe("dona@ac.com")).admin, true);
  await salvarPerfil("gerente@ac.com", ["vendas"]);
  assert.equal((await perfilDe("gerente@ac.com")).admin, false);
  assert.equal((await definirAdmin("gerente@ac.com", true)).ok, true);
  assert.equal((await perfilDe("gerente@ac.com")).admin, true);
  assert.equal((await definirAdmin("dona@ac.com", false)).ok, true);
  assert.equal((await perfilDe("dona@ac.com")).admin, false);
  const ultima = await definirAdmin("gerente@ac.com", false);
  assert.equal(ultima.ok, false);
  assert.match(ultima.error, /ao menos uma/);
  assert.equal((await perfilDe("gerente@ac.com")).admin, true);
  /* Quem deixa de ser admin volta para as abas que tinha. */
  await definirAdmin("dona@ac.com", true);
  await definirAdmin("gerente@ac.com", false);
  assert.deepEqual((await perfilDe("gerente@ac.com")).paginas, ["vendas"]);
});

test("senha provisória: marca, aparece no perfil e na lista, e some quando a pessoa troca", async () => {
  await salvarPerfil("nova@ac.com", ["dre"]);
  await marcarSenhaProvisoria("nova@ac.com", true);
  assert.equal((await perfilDe("nova@ac.com")).senhaProvisoria, true);
  assert.equal((await listarPerfis()).find((p) => p.email === "nova@ac.com").senhaProvisoria, true);
  /* Mudar aba não apaga a marca. */
  await salvarPerfil("nova@ac.com", ["dre", "vendas"]);
  assert.equal((await perfilDe("nova@ac.com")).senhaProvisoria, true);
  await marcarSenhaProvisoria("nova@ac.com", false);
  assert.equal((await perfilDe("nova@ac.com")).senhaProvisoria, false);
  /* Tirar a marca de quem não tem perfil não cria perfil. */
  await marcarSenhaProvisoria("fantasma@ac.com", false);
  assert.equal((await listarPerfis()).some((p) => p.email === "fantasma@ac.com"), false);
});
