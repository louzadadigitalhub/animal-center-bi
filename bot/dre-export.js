/* Monta a planilha do DRE para mandar ao contador.

   Uma aba por unidade, porque matriz e filial tem planos de contas
   diferentes e nao existe soma linha a linha entre elas.

   Os valores vao como numero, nao como texto formatado: contador
   soma, filtra e faz tabela dinamica em cima, e texto quebraria tudo
   isso. A formatacao em R$ fica no formato da celula.

   Os meses que ainda nao aconteceram entram, mas marcados. Eles tem
   aluguel, salario e parcela a vencer lancados e quase nenhuma receita,
   entao passam uma impressao de prejuizo que nao e real — omitir seria
   esconder lancamento que existe, e mostrar sem aviso seria pior. */
import ExcelJS from "exceljs";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const MOEDA = '#,##0.00;[Red]-#,##0.00';

const NOME_UNIDADE = { matriz: "Animal Center", filial: "São Cristóvão" };

function dataBr(iso) {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export async function planilhaDre(matriz) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Painel Animal Center";
  wb.created = new Date();

  for (const parte of matriz.partes) {
    const nome = NOME_UNIDADE[parte.unit] || parte.unit;
    const ws = wb.addWorksheet(nome.slice(0, 31), {
      views: [{ state: "frozen", xSplit: 1, ySplit: 5 }],
    });

    ws.mergeCells("A1:N1");
    ws.getCell("A1").value = `DRE ${matriz.ano} · ${parte.ambiente}`;
    ws.getCell("A1").font = { bold: true, size: 14 };

    ws.mergeCells("A2:N2");
    ws.getCell("A2").value =
      `Demonstrativo do SimplesVet, regime de ${matriz.regime}, ${matriz.situacao === "pagos" ? "so pagos e recebidos" : "todas as situacoes"}. Valores em R$. Extraido em ${dataBr(matriz.at)}.`;
    ws.getCell("A2").font = { size: 10, color: { argb: "FF666666" } };

    ws.mergeCells("A3:N3");
    ws.getCell("A3").value =
      matriz.ultimoRealizado >= 0 && matriz.ultimoRealizado < 11
        ? `Realizado ate ${MESES[matriz.ultimoRealizado]}. Como entram so contas pagas e recebimentos baixados, as colunas seguintes trazem apenas o que ja foi pago ou recebido adiantado. O acumulado soma so ate ${MESES[matriz.ultimoRealizado]}.`
        : "Exercicio fechado: todas as colunas sao realizadas.";
    ws.getCell("A3").font = { size: 10, color: { argb: "FF9C6500" } };
    ws.getRow(3).height = 28;
    ws.getCell("A3").alignment = { wrapText: true, vertical: "top" };

    const cab = ws.getRow(5);
    cab.values = ["Categoria", ...MESES, `Acumulado`];
    cab.font = { bold: true };
    cab.alignment = { horizontal: "center" };
    cab.getCell(1).alignment = { horizontal: "left" };
    cab.eachCell((c) => {
      c.border = { bottom: { style: "thin" } };
    });
    /* As colunas nao realizadas ja saem com o cabecalho em outro tom —
       quem abrir a planilha ve a divisa antes de olhar numero nenhum. */
    for (let m = matriz.ultimoRealizado + 1; m <= 11; m++) {
      cab.getCell(2 + m).font = { bold: true, italic: true, color: { argb: "FF9C6500" } };
      cab.getCell(2 + m).value = `${MESES[m]} (a realizar)`;
    }

    ws.getColumn(1).width = 42;
    for (let i = 2; i <= 14; i++) ws.getColumn(i).width = 14;

    parte.linhas.forEach((l) => {
      const r = ws.addRow([
        "   ".repeat(l.nivel) + l.nome,
        ...Array.from({ length: 12 }, (_, m) => l.valores[m] ?? 0),
        l.acumulado,
      ]);
      for (let i = 2; i <= 14; i++) r.getCell(i).numFmt = MOEDA;
      if (l.total) {
        r.font = { bold: true };
        r.getCell(1).border = { top: { style: "hair" } };
      }
      for (let m = matriz.ultimoRealizado + 1; m <= 11; m++) {
        r.getCell(2 + m).font = { ...(r.font || {}), color: { argb: "FF9C6500" } };
      }
      r.getCell(14).border = { left: { style: "thin" } };
    });

    ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: 14 } };

    /* Despesas pela regra da clinica (25/09): soma de quatro grupos do
       demonstrativo. Vai num bloco proprio, embaixo da arvore, para o
       contador ver a composicao sem ter que achar cada grupo nela — em
       cada unidade eles ficam pendurados num lugar diferente. */
    if (parte.despesas) {
      ws.addRow([]);
      const titulo = ws.addRow(["Despesas (regra da clinica)"]);
      titulo.font = { bold: true, size: 12 };
      const nota = ws.addRow(["Soma de: " + parte.despesas.grupos.map((g) => g.nome).join(" + ") + ". Valores positivos."]);
      nota.font = { size: 10, color: { argb: "FF666666" } };
      for (const g of parte.despesas.grupos) {
        const r = ws.addRow(["   " + g.nome, ...g.valores.slice(0, 12), g.acumulado]);
        for (let i = 2; i <= 14; i++) r.getCell(i).numFmt = MOEDA;
        r.getCell(14).border = { left: { style: "thin" } };
      }
      const tot = ws.addRow(["Total de despesas", ...parte.despesas.totais.slice(0, 12), parte.despesas.acumulado]);
      tot.font = { bold: true };
      for (let i = 1; i <= 14; i++) tot.getCell(i).border = { top: { style: "thin" } };
      for (let i = 2; i <= 14; i++) tot.getCell(i).numFmt = MOEDA;
    }
  }

  return wb.xlsx.writeBuffer();
}
