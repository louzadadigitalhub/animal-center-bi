/* Casa o nome que aparece na venda com o nome do cadastro de usuarios.

   Os dois nao batem: a venda traz "Fernanda Vieira" e o cadastro
   "Fernanda Dallacort Vieira". Comparar string inteira nao funciona, e
   comparar so o primeiro nome confundiria as duas Lauras do cadastro.

   Regra: primeiro nome igual, mais pelo menos um sobrenome em comum.
   Quando mais de um candidato passa, vence o de mais sobrenomes em comum;
   empate nao casa ninguem — errar a foto e pior que nao ter foto. */

import { norm } from "./people.js";

const IGNORAR = new Set(["de", "da", "do", "dos", "das", "e"]);

function partes(nome) {
  return norm(nome)
    .split(/\s+/)
    .filter((t) => t && !IGNORAR.has(t));
}

export function casarNome(nomeVenda, candidatos) {
  const a = partes(nomeVenda);
  if (!a.length) return null;
  const [primeiro, ...restoA] = a;

  const pontuados = [];
  for (const c of candidatos) {
    const bParts = partes(c.nome);
    if (!bParts.length || bParts[0] !== primeiro) continue;
    const restoB = new Set(bParts.slice(1));
    const comuns = restoA.filter((t) => restoB.has(t)).length;
    /* Nome de uma palavra so dos dois lados casa direto; com sobrenome,
       exige ao menos um em comum. */
    if (restoA.length && restoB.size && comuns === 0) continue;
    pontuados.push({ c, comuns });
  }
  if (!pontuados.length) return null;
  pontuados.sort((x, y) => y.comuns - x.comuns);
  if (pontuados.length > 1 && pontuados[0].comuns === pontuados[1].comuns) return null;
  return pontuados[0].c;
}
