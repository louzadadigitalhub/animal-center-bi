# Nova estrutura do painel — Animal Center

Regra: **os dados do BI antigo entram todos**. O visual da octaX **não entra**.
Em cima disso entra o que a reunião pediu e o BI antigo não tinha.

```
Seletor de casa (sempre visível)
├─ Matriz          Animal Center
├─ Filial 1        São Cristóvão
└─ As duas         DRE + comparação lado a lado
        │
        ▼
Telas (as mesmas nas três casas; em “As duas” cada número diz de qual veio)
```

## Telas

| Tela | O que já existia no BI antigo | O que a reunião pediu a mais |
|---|---|---|
| **1. Vendas** | Faturamento, qtd venda, ticket/venda, ticket/**cliente**, pilares (internamento, consultas, exames, petshop/farmácia, vacinas, cirurgias, procedimentos), conversão, filtros (funcionário, grupo, produto, hora, ano, mês, dia, origem, status, plantão) | Faturamento por **recebimento** (caixa). Alarme se o grupo cai da média. Dia 10 vs dia 10 dos anos anteriores |
| **2. Ritmo do dia** | Fechamento: consulta, emergência, internação, exame + acumulado vs anos | Atendimentos = consulta + vacina (pra remuneração) |
| **3. Equipe** | Ranking, matriz desenvolver / +vendas / +ticket / valorizar | Ticket da pessoa vs o histórico **dela**. % cirurgia eletiva vs meta. Versão TV no corredor (sem login) |
| **4. Clientes** | Mapa, idade/sexo do pet, gênero do tutor, raça | Origem **Instagram / Facebook / Google** separados (não “redes sociais”) |
| **5. Recorrência** | Ativo / inativo / pré-inativo, fluxo por hora, novo vs antigo vs faturamento | — |
| **6. Vacinas** | Aplicada / vencida / programada por tipo | Entra na conta de atendimento |
| **7. Pesquisa** | NPS / comentários (Pangeia — estava fora do ar) | Continua, sem o “liga pra octaX” |
| **8. DRE** | **Não existia** | Receita − custo linha a linha. No modo “As duas”, coluna Matriz + Filial + Total |

## O que some como aba pública

Não é dado jogado fora. É dado que **não pode ficar no corredor nem no link aberto**.

| BI antigo | No nosso |
|---|---|
| Clientes Pangeia (nome + telefone na rua) | Lista **travada** dentro de Recorrência, só gestão |
| Cliente recorrente com telefone | Idem |
| Página FAT (uma data, um número) | Lixo. Não recriamos |

## Quem vê o quê (fase 1)

| Pessoa | Enxerga |
|---|---|
| Dono / gestão | As três casas + DRE + listas com telefone |
| Veterinário (depois) | Só a casa e os números **dele** |
| TV no corredor | Só ranking. Sem login. Sem telefone. Sem DRE |

## Filtros que o Luiz já usa (vão junto)

Funcionário · Grupo · Produto/serviço · Hora · Ano · Mês · Dia · Unidade (o seletor de cima) · Origem · Status da venda · Cliente · Plantão

## Fora desta estrutura (ano que vem / visita mensal)

- Trocar o SimplesVet
- Chat perguntando os números pelo WhatsApp
- Relatório semanal automático (eles preferem ao vivo)
