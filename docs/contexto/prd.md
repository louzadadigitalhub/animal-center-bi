# Agente de Compras — PRD

## O que é

Um agente que o Luís Eduardo, médico-veterinário e gestor do Hospital Veterinário Animal Center (Lajeado/RS), usa pelo WhatsApp para organizar estoque e compras. Ele conversa com o agente como faria com uma pessoa da equipe: pede o pedido do mês, avisa que chegou mercadoria, conta o estoque, diz o que está faltando. O agente sugere quantidades, separa por fornecedor, lista o que falta decidir e escreve as mensagens para o Luís encaminhar aos fornecedores.

O agente mora dentro deste repositório, ao lado do painel (portalanimal.center), e roda no mesmo serviço. O WhatsApp passa por uma Evolution API só da clínica, num número próprio (chip novo).

## O problema

As compras eram feitas por uma pessoa que deixou a função em setembro de 2026. O que ficou foi um documento de passagem de função e duas planilhas. A planilha de compras guarda o histórico do que foi **comprado** mês a mês, não do que foi **consumido**, e quase não tem estoque preenchido. A comparação de quatro fornecedores tem preços de julho de 2026, que já não são cotação vigente. Sem alguém dedicado, o risco é comprar no escuro: faltar item crítico ou sobrar o que gira pouco.

## Para quem

Para o Luís Eduardo, que revisa e decide tudo o que é comprado. O agente prepara e organiza; nunca fecha pedido, nunca manda mensagem a fornecedor e nunca afirma que algo foi feito sem ter sido feito e confirmado.

## O que ele faz

O agente entende os comandos do prompt original: "prepara o pedido do mês" (compra principal, no início do mês), "prepara um pedido complementar" (revisão por volta do dia 15) e as atualizações do dia a dia, como "fiz uma compra extra", "chegou mercadoria" e "está faltando". Cada atualização vira um registro com data e origem, guardado entre uma conversa e outra. O agente distingue compra planejada, pedido enviado, pedido aguardando entrega, mercadoria recebida e produto consumido; pedido enviado não aumenta o estoque até o recebimento ser confirmado.

No pedido do mês, ele lista por fornecedor e categoria o produto, a marca, a apresentação, a unidade, o saldo confirmado, a média disponível, o que já foi pedido e não chegou, a quantidade sugerida e o porquê. Quando há saldo e média de saídas confiáveis, a sugestão é a cobertura desejada menos o estoque e menos o que está a caminho, com a conta à mostra. Quando faltam dados, a sugestão sai marcada como preliminar, dizendo o que precisa ser confirmado. Itens sem cotação válida, com preço antigo, estoque desconhecido ou apresentação incompatível vão para uma lista de pendências. No fim vêm as mensagens de WhatsApp por fornecedor, com telefone só quando ele está confirmado no documento ou pelo Luís, e a lista curta de decisões que o Luís precisa tomar.

## Regras que não mudam

Cateteres só Nipro; soluções fisiológicas e Ringer lactato só JP. Não trocar marca, concentração ou apresentação porque outro item custa menos. Preço de julho de 2026 é referência histórica, nunca cotação vigente; preço novo entra com a data. Histórico de compra não é consumo. Não inventar estoque, preço, prazo ou quantidade mínima. Conferir unidade (unidade, caixa, frasco, pacote) antes de comparar ou calcular. A média de saídas do SimplesVet só entra quando o Luís informa. A compra da farmácia mira cerca de três meses de cobertura, só nos produtos em que o Luís confirmar esse critério.

## Fora do escopo

Financeiro, contas a pagar, recepção e contas de pacientes internados ficam de fora — o leitor de cobranças de quinta-feira é outra ferramenta. O agente também não fala com fornecedor nem com nenhum outro número além dos autorizados.

## O que existe hoje

A planilha "Tabela para pedidos - 4 fornecedores" tem cerca de 140 produtos com o distribuidor escolhido (MCW 78, Santa Cruz 26, Cristalina 16, Althis 14), o valor de julho de 2026 e os critérios, mais sete itens sem cotação válida (solução fisiológica 1 L JP, manitol, simeticona, trazodona 100 mg, PHMB, entre outros). A coluna de quantidade média mensal está vazia em quase todos.

A planilha "Compras internas" tem abas por categoria — cirúrgica (139 itens), farmácia (71), injetáveis, fios cirúrgicos, testes rápidos, Idexx, vacinas e limpeza — com o histórico de compras por mês. Cirúrgica e farmácia cobrem janeiro a setembro de 2026; as outras param em maio de 2025. Os nomes dos produtos não batem entre as duas planilhas e precisam ser casados.

O documento de passagem de função traz a rotina (compra principal no dia 1 com boleto de 30 dias, revisão no meio do mês, quadro de faltas, farmácia com cerca de três meses, Zoetis com a representante, pela tabela própria) e os contatos de doze fornecedores. A tabela da Zoetis (Anexo 2) ainda não foi entregue.

## Como saber que deu certo

O Luís pede "prepara o pedido do mês" no WhatsApp e, em poucos minutos, recebe um pedido que ele consegue conferir, com quantidades justificadas, pendências claras e mensagens prontas para encaminhar; e cada atualização que ele manda aparece corretamente no pedido seguinte.

---

# Agente de Contas a Pagar (quinta-feira) — PRD

## O que é

Toda quinta-feira a clínica paga as contas que vencem daquele dia até a quinta seguinte. Este agente prepara essa lista para o Luís Eduardo: lê as cobranças que chegaram nas quatro caixas de e-mail da clínica, lê o Contas a pagar do SimplesVet das duas unidades e cruza os dois. O resultado aparece numa aba do painel, pronta na quinta às 7h, sem mensagem por fora.

## O que a lista mostra

Pagar nesta quinta: contas do SimplesVet não pagas que vencem até a quinta seguinte, com as atrasadas destacadas. Chegou e não está lançado: cobrança encontrada no e-mail (boleto ou nota fiscal) sem conta correspondente no SimplesVet, para lançar antes de pagar. Lançado sem cobrança no e-mail: só para conferência. Cada item diz de onde veio (caixa de e-mail e data, ou unidade do SimplesVet), o fornecedor, o valor e o vencimento.

## Fontes

Caixas: Financeiro, Centro, São Cristóvão e Centro Pet (os endereços ficam só no ambiente do servidor, `MAIL_1..4_EMAIL`), por senha de app do Gmail guardada só no servidor. SimplesVet: a API que a própria tela Contas a pagar usa (`api.simples.vet/app/v1/financeiro/lancamentos`, natureza D), com o mesmo login do robô, nas duas unidades.

## Fora do escopo

O agente não paga nada, não lança nada no SimplesVet e não manda mensagem. Compras são do Agente de Compras.

---

# Melhorias do BI (projeto de 20/10/2026) — PRD

## O que é

O documento "Projeto de melhorias e atualização do BI" da clínica, mais os vídeos do BI antigo (octaX, Power BI) e a planilha "Análise financeira ANIMAL CENTER". O pedido em destaque: a aba **Dashboard** do BI igual à "DASHBOARD ANÁLISE ESTRATÉGICA" da planilha, com os dados entrando sozinhos.

## O que o projeto pede

1. Dashboard igual ao Excel: meses em colunas, valor e % do faturamento, as mesmas linhas de resultado e as mesmas cores.
2. Comparativo de faturamento mensal, anual e entre anos, em R$ e %, com gráfico de uma linha por ano (como o "Faturamento" do octaX).
3. Filtro por dia de corte: comparar meses e anos só até o mesmo dia; em mês mais curto, vale o último dia que existe.
4. DRE por categoria contra a média dos 12 meses anteriores, com diferença em R$ e % e sinal de acima ou abaixo.
5. Seis rankings dos veterinários: ticket médio por cliente, consultas por cirurgia, exames por consulta, conversão de consulta em internação (pelo RG do paciente), atendimentos (consultas + idas de vacina, sem contar dose) e nota do tutor de 0 a 10 pelo WhatsApp, com mínimo de avaliações.
6. Classificação geral "Coroa de Ouro": soma das posições, com pesos configuráveis.
7. Página de TV com endereço próprio: só leitura, letra grande, atualiza sozinha, tela cheia, sem dado financeiro nem pessoal.
8. Filtros comuns (ano, mês, dia de corte, período comparativo, profissional), sem duplicar venda, sem contar cancelada, e cada número rastreável.

## Do BI antigo que ainda falta (vídeos de 20/10)

Curva de fluxo de clientes por hora com uma linha por mês; recorrência com clientes, recorrentes e novos por mês; faturamento por funcionário, grupo e produto com % de variação; gráfico de conversão (consultas, cirurgias, exames e vacinas por mês); filtro de dia (1 a 31).

## Como saber que deu certo

A diretoria abre o Dashboard e vê os mesmos números da planilha nos meses fechados, sem digitar nada além do pró-labore e do relatório do mês.
