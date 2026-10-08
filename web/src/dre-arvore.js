/* A DRE do SimplesVet chega como lista plana, cada linha com seu nível.
   Aqui ela vira árvore para a tela abrir e fechar: cada conta fica embaixo
   da última que tem nível menor logo acima dela. */

export function arvoreDre(linhas) {
  const raiz = { nivel: -1, filhos: [] };
  const pilha = [raiz];
  for (const l of linhas || []) {
    const no = { nome: l.nome, nivel: l.nivel, total: Boolean(l.total), valor: Number(l.valor) || 0, filhos: [] };
    while (pilha.length > 1 && pilha[pilha.length - 1].nivel >= no.nivel) pilha.pop();
    pilha[pilha.length - 1].filhos.push(no);
    pilha.push(no);
  }
  return raiz.filhos;
}

/* Mesmo critério do servidor para achar os grupos: sem acento e sem
   caixa, primeira ocorrência na ordem do demonstrativo. */
const chave = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export function acharNo(nos, nome) {
  const alvo = chave(nome);
  for (const n of nos || []) {
    if (chave(n.nome) === alvo) return n;
    const dentro = acharNo(n.filhos, nome);
    if (dentro) return dentro;
  }
  return null;
}

const centavos = (n) => Math.round(n * 100) / 100;

/* Conta zerada no período e sem nada embaixo só ocupa espaço. */
export function temValor(n) {
  return centavos(n.valor) !== 0 || n.filhos.some(temValor);
}

/* As duas unidades lado a lado: soma conta a conta pelo nome, em todos os
   níveis. Cada clínica tem seu plano de contas, então uma conta que só
   existe numa entra com o valor dela. */
export function juntarNos(listas) {
  const porChave = new Map();
  for (const lista of listas || []) {
    for (const n of lista || []) {
      const k = chave(n.nome);
      if (!porChave.has(k)) porChave.set(k, { nome: n.nome, nivel: n.nivel, total: n.total, valor: 0, partes: [] });
      const atual = porChave.get(k);
      atual.valor = centavos(atual.valor + n.valor);
      atual.partes.push(n.filhos);
    }
  }
  return [...porChave.values()].map(({ partes, ...n }) => ({ ...n, filhos: juntarNos(partes) }));
}
