# Agente de Compras — decisões

**2026-10-16 — Canal é o WhatsApp, num chip novo só do agente.** O Luís conversa com ele como contato; o número da clínica continua só da recepção, sem conversa misturada.

**2026-10-16 — Evolution própria da clínica, não a da Pórtico.** O dono pediu para não misturar com a Pórtico (`zap.painel.uk`). Sobe um serviço Evolution só da clínica no EasyPanel, ao lado do painel.

**2026-10-16 — Chave de IA da clínica.** O dono cria a chave e cola direto no EasyPanel, para o custo ficar separado e a chave não passar por conversa nenhuma.

**2026-10-16 — O agente roda dentro do animal-center-bi.** Reaproveita deploy, volume `/data`, login e permissões do painel; uma futura aba Compras lê o mesmo caderno.

**2026-10-16 — Código calcula, IA conversa.** Quantidade sugerida, média, saldo e pendência saem de funções testadas. A IA não inventa número: ela chama a ferramenta e redige.

**2026-10-16 — Atualização vira evento, nunca sobrescreve.** O caderno é só de acréscimo, com data e origem, para sempre dar para dizer de onde veio um saldo.

**2026-10-16 — Repositório é público: dado de compras fica fora do git.** O GitHub `louzadadigitalhub/animal-center-bi` é público. Catálogo, preços e telefones de fornecedor são gerados numa pasta local e sobem direto para `/data/compras` no servidor; só o importador e a documentação entram no repositório.

**2026-10-16 — Casamento de nomes entre as planilhas é estrito.** Na primeira rodada, "Fenobarbital ampola" casou com "Furosemida ampola" e "Luva P" com "Luva M". Agora o nome principal, o tamanho e a medida têm de bater, e os melhores pares são escolhidos no conjunto todo. Marca diferente (Propofol: Baxter na planilha de compras, União Química na de preços) e casamento fraco (30 itens) viram "conferir", que o agente mostra como pendência em vez de assumir.

**2026-10-19 — Contas a pagar: aviso só no painel, para o Luís, pronto na quinta às 7h.** Decisão do dono: sem Telegram nem WhatsApp por enquanto.

**2026-10-19 — Quatro caixas de e-mail, por senha de app.** Financeiro, Centro, São Cristóvão e Centro Pet. As senhas normais guardadas no `.env` local eram recusadas pelo Gmail; as senhas de app do documento da clínica entraram e foram gravadas só no ambiente do servidor.

**2026-10-19 — SimplesVet por API, não por tela.** A tela Contas a pagar é uma aplicação nova que pede os dados a `api.simples.vet/app/v1/financeiro/lancamentos`; a sessão do login basta. Ler a API é mais estável do que raspar a tabela.

**2026-10-19 — Pausa de manutenção do robô.** Explorar o portal com o mesmo login derrubaria a sessão do robô; o arquivo `/data/robo-pausado` pausa a coleta por até 30 minutos e expira sozinho.

**2026-10-19 — Semana da quinta vai de quinta a quarta.** A regra da clínica diz "até a quinta seguinte"; a conta que vence na outra quinta entra na lista daquela quinta, para nada aparecer em duas semanas.

**2026-10-19 — A mesma cobrança chega mais de uma vez.** No teste real, o mesmo boleto da TCR veio em dois e-mails e a Bagé mandou nota e boleto separados. Mesmo valor e vencimento até 2 dias viram um item só (fica a fonte mais confiável: nota, depois boleto, depois texto); sem isso, a cópia aparecia como "não lançada".

**2026-10-19 — Recibo não é conta.** Texto de e-mail sem vencimento (Canva, Mercado Livre) é recibo de compra já paga e fica fora. Nota sem parcela (uma da Zoetis de R$ 56 mil, possível remessa ou consignação) e aviso com vencimento mas sem valor vão para "conferir", sem entrar no total. No teste da semana de 22/10 a lista principal caiu de 17 para 5 cobranças.


**2026-10-20 — Dashboard: pró-labore digitável.** O SimplesVet não tem conta de pró-labore: a retirada dos sócios cai em "Despesas administrativas" junto com gastos pequenos, e a planilha usa um número redondo, alguns mil abaixo da conta. O admin digita o pró-labore do mês; sem valor digitado, vale a conta. O resultado operacional não muda com isso, só a divisão entre despesa operacional e pró-labore.

**2026-10-20 — Dashboard: empréstimos em linha própria.** A planilha separava "Pagamento de Empréstimos" até abr/2025 e depois somou em Investimentos, deixando a linha Empréstimos zerada. O BI separa sempre; o resultado líquido é o mesmo dos dois jeitos.

**2026-10-20 — Dashboard: taxa de antecipação e devoluções fora.** Igual à planilha nos meses recentes (set/2026 bate no centavo). São valores pequenos perto da taxa de cartão; se a diretoria quiser, entram na linha de taxa de cartão.

**2026-10-20 — O que a diretoria digita mora no volume.** `/data/dashboard-ajustes.json` (pró-labore, pró-labore "justo", relatório do mês). O repositório é público.

**2026-10-20 — Faturamento do comparativo = o do octaX.** Soma do Líquido de todos os itens pela data da venda, as duas unidades. Set/2023 e set/2025 batem no centavo com o octaX. É diferente da Receita total (card de recebimentos) da DRE e do Dashboard, que conta o que entrou no caixa.

**2026-10-20 — Cliente novo = primeira compra da vida no mês.** Set/2026: 447 recorrentes, igual ao octaX; 165 novos contra 168.

**2026-10-20 — Atribuição dos rankings.** A exportação do SimplesVet só tem a coluna "Funcionário" e não tem RG do paciente. Profissional = Funcionário do item; paciente = código do cliente + nome do animal. Exame, cirurgia e internação vão para o veterinário da consulta mais recente do paciente, dentro de janelas de 2, 30 e 3 dias (editáveis). Entra no ranking quem tem 10 consultas ou mais no período; pesos começam todos em 1. Tudo editável pelo admin na aba Veterinários.

**2026-10-20 — Nota do tutor sem o número da clínica.** Sem a Evolution própria, a recepção manda o link pelo WhatsApp do computador (wa.me, mensagem pronta). Cada consulta tem um link que vale uma resposta; fica guardado só o nome do veterinário, o dia e um hash do paciente. A nota entra no ranking a partir de 5 avaliações no período.

**2026-10-20 — DRE contra a média sem dia de corte.** O Demonstrativo vem fechado por mês, sem o dia do lançamento. Para ter dia de corte seria preciso ler cada lançamento pago pela API de contas a pagar, 13 meses para trás.

**2026-10-20 — TV pública sem dinheiro.** /tv mostra posição e indicadores de atendimento; o ticket médio (em reais) aparece só como posição.
