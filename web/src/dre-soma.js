/* Soma as duas unidades do mesmo recorte.
   Receita e despesa só fecham se as duas tiverem número: somar uma só
   e chamar de "as duas" mentiria. Diferença segue a regra da clínica:
   despesas − receita. Negativo significa que entrou mais do que saiu. */

function centavos(n) {
  return Math.round(Number(n) * 100) / 100;
}

export function somarUnidades(partes) {
  const lista = Array.isArray(partes) ? partes : [];
  const receitaOk =
    lista.length > 1 && lista.every((p) => p?.receita && Number.isFinite(Number(p.receita.total)));
  const despesaOk =
    lista.length > 1 && lista.every((p) => p?.despesas && Number.isFinite(Number(p.despesas.total)));
  const receita = receitaOk ? centavos(lista.reduce((a, p) => a + Number(p.receita.total), 0)) : null;
  const despesas = despesaOk ? centavos(lista.reduce((a, p) => a + Number(p.despesas.total), 0)) : null;
  const nomes = [];
  const porNome = new Map();
  if (despesaOk) {
    for (const p of lista) {
      for (const g of p.despesas.grupos || []) {
        if (!porNome.has(g.nome)) {
          nomes.push(g.nome);
          porNome.set(g.nome, { nome: g.nome, valor: 0, lancado: false });
        }
        const atual = porNome.get(g.nome);
        atual.valor = centavos(atual.valor + Number(g.valor || 0));
        atual.lancado = atual.lancado || Boolean(g.lancado);
      }
    }
  }
  const resultado = receita != null && despesas != null ? centavos(despesas - receita) : null;
  return {
    receita,
    despesas,
    resultado,
    grupos: nomes.map((nome) => porNome.get(nome)),
  };
}
