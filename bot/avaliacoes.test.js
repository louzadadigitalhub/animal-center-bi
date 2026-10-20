import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TOKEN, criarLink, lerAvaliacoes, notasDoPeriodo, responder, resumoPesquisa, verLink } from "./avaliacoes.js";

test("link por consulta: o mesmo para o mesmo paciente no dia, e uma resposta só", async () => {
  const dir = await mkdtemp(join(tmpdir(), "aval-"));
  const a = await criarLink(dir, { funcionario: "Dra. Ana Souza", unit: "matriz", dia: "2026-10-20", codigo: "12", animal: "Rex" });
  const b = await criarLink(dir, { funcionario: "Dra. Ana Souza", unit: "matriz", dia: "2026-10-20", codigo: "12", animal: "rex" });
  assert.match(a.token, TOKEN);
  assert.equal(a.token, b.token);
  const outro = await criarLink(dir, { funcionario: "Dra. Ana Souza", unit: "matriz", dia: "2026-10-21", codigo: "12", animal: "Rex" });
  assert.notEqual(outro.token, a.token);

  const pub = await verLink(dir, a.token);
  assert.deepEqual(pub, { profissional: "Ana", clinica: "Animal Center", respondida: false });
  assert.equal(await verLink(dir, "x"), null);

  await assert.rejects(responder(dir, a.token, { nota: 11 }), /0 a 10/);
  await responder(dir, a.token, { nota: 9, comentario: "ótimo atendimento" });
  await assert.rejects(responder(dir, a.token, { nota: 10 }), /ja respondida/);

  /* Nada do tutor fica guardado: só o hash do paciente. */
  const salvo = JSON.stringify(await lerAvaliacoes(dir));
  assert.equal(salvo.includes("Rex"), false);
});

test("notas e resumo do período", async () => {
  const dados = {
    links: {
      a: { funcionario: "Ana", unit: "matriz", dia: "2026-10-05" },
      b: { funcionario: "Ana", unit: "matriz", dia: "2026-10-25" },
      c: { funcionario: "Bia", unit: "filial", dia: "2026-10-06" },
      d: { funcionario: "Bia", unit: "filial", dia: "2026-09-06" },
    },
    respostas: { a: { nota: 10, comentario: "" }, b: { nota: 6, comentario: "demorou" }, c: { nota: 8, comentario: "" }, d: { nota: 0, comentario: "" } },
  };
  assert.deepEqual(notasDoPeriodo(dados, { ano: 2026, mes: 9 }), { Ana: { soma: 16, n: 2 }, Bia: { soma: 8, n: 1 } });
  assert.deepEqual(notasDoPeriodo(dados, { ano: 2026, mes: 9, dia: 20 }), { Ana: { soma: 10, n: 1 }, Bia: { soma: 8, n: 1 } });
  assert.deepEqual(notasDoPeriodo(dados, { ano: 2026, mes: 9, unit: "filial" }), { Bia: { soma: 8, n: 1 } });
  const r = resumoPesquisa(dados, { ano: 2026, mes: 9 });
  assert.equal(r.respostas, 3);
  assert.equal(r.media, 8);
  /* 1 promotor (10), 1 detrator (6), 1 neutro (8). */
  assert.equal(r.nps, 0);
  assert.equal(r.comentarios[0].comentario, "demorou");
});
