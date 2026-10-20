# Agente de Compras — tarefas

Uma de cada vez, na ordem. Cada uma termina com teste passando.

1. ✅ (16/10) Importar as planilhas: gerar `catalogo.json` e `fornecedores.json` e o relatório de nomes que não casaram entre as duas planilhas.
2. Caderno de eventos e estado derivado de cada produto (saldo confirmado, a caminho, média e a origem dela).
3. Cálculo do pedido mensal e do complementar, com pendências e decisões.
4. Ferramentas do agente e o agente com o prompt do Luís, testados com conversas simuladas.
5. Rota do webhook e envio pela Evolution, testados com uma Evolution falsa.
6. Subir a Evolution da clínica no EasyPanel e criar a instância `compras` (precisa do chip para o QR code).
7. A clínica cola a chave de IA no EasyPanel; autorizar o número do Luís.
8. Teste de ponta a ponta com o Luís.

Depois: aba Compras no painel para ver o caderno; ler a média de saídas do SimplesVet pelo robô que já entra no portal (só se o Luís quiser).

---

# Agente de Contas a Pagar — tarefas

1. ✅ (19/10) Descobrir onde ficam as contas no SimplesVet: API `v1/financeiro/lancamentos`, autenticada pela sessão.
2. ✅ (19/10) Leitor do SimplesVet (`pagar-sv.js`) nas duas unidades, gravando `pagar-sv.json`.
3. ✅ (19/10) Decodificador de boleto e leitor de NF-e, puros e testados.
4. ✅ (19/10) Leitor de e-mail completo (corpo e anexos) nas quatro caixas, incremental.
5. ✅ (19/10) Cruzamento e semana da quinta, testados.
6. ✅ (19/10) Agenda no robô (30 em 30 min, 6h–20h, e antes da quinta 7h) e rota `/api/contas`.
7. ✅ (19/10) Aba "Contas a pagar" no painel e permissão `contas` para o Luís.
8. Primeira quinta conferida com a clínica.

---

# Melhorias do BI (projeto de 20/10/2026) — tarefas

1. ✅ (20/10) Aba Dashboard igual à planilha, conferida contra as 20 colunas de fev/2025 a set/2026.
2. Comparativo de faturamento entre anos (gráfico de uma linha por ano, mensal e anual, R$ e %).
3. Dia de corte nos indicadores e nos comparativos.
4. DRE por categoria contra a média de 12 meses.
5. Rankings dos veterinários: ticket médio por cliente primeiro, depois os outros cinco.
6. Coroa de Ouro, com os pesos que a diretoria definir.
7. Página de TV própria, sem dado financeiro.
8. Nota do tutor pelo WhatsApp (precisa do número da clínica, o mesmo do Agente de Compras).
9. O que falta do octaX: fluxo por hora por mês, recorrência mensal, faturamento por funcionário, grupo e produto, gráfico de conversão.
