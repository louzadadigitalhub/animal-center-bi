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
2. ✅ (20/10) Aba Comparativo: uma linha por ano, mês a mês e ano, em R$ e %, com faturamento, vendas, clientes e ticket.
3. ✅ (20/10) Dia de corte no comparativo, no faturamento por funcionário/grupo/produto, no fluxo por hora e nos rankings. O DRE não tem (o demonstrativo vem fechado por mês).
4. ✅ (20/10) DRE: cada conta contra a média dos 12 meses anteriores, com diferença em R$ e % e sinal de acima ou abaixo.
5. ✅ (20/10) Aba Veterinários com os seis rankings.
6. ✅ (20/10) Coroa de Ouro com pesos, mínimo de consultas, janelas e lista de quem fica fora, editáveis pelo admin.
7. ✅ (20/10) Página /tv, pública, sem valor em reais, atualiza a cada 5 minutos, com botão de tela cheia.
8. ✅ (20/10) Nota do tutor: link por consulta mandado pelo WhatsApp do computador da recepção (wa.me) e página pública /avaliar. Quando a clínica tiver o número próprio, o envio pode ficar automático.
9. ✅ (20/10) Do octaX: fluxo por hora por mês (Ritmo), recorrência mensal (Recorrência), faturamento por funcionário, grupo e produto e gráfico de conversão (Vendas).
10. A diretoria confere os pesos, o mínimo de consultas e quem fica fora do ranking.
