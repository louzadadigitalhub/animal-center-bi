# Animal Center (Lajeado-RS) — briefing da reunião

Fonte: gravação com os donos. Assunto solto (trânsito, café, torta, fofoca) foi descartado.

## O que é a empresa hoje

```
SimplesVet (nuvem)  →  BI atual (Power BI de terceiros, D+1)
                    →  Planilhas manuais do gestor
                    →  WhatsApp / tabela de ranking pro time
```

- Sistema de operação: **SimplesVet** (nuvem, sem servidor local). Login do robô testado em 11/09/2026 — entra em `Gestao | Animal Center` (`app.simples.vet`). Senha só no `.env` local, nunca neste arquivo.
- Duas unidades no BI novo: **Matriz (Animal Center)** e **Filial 1 (São Cristóvão)**, cada uma numa aba, **mais uma aba consolidada** das duas para a DRE.
- Login SimplesVet do robô: `gestaoestrategica.office@gmail.com` (Animal Center). Re-login em 11/09 15:20: o menu de empresa ainda lista **só Animal Center**. São Cristóvão aparece como **usuário/caixa** na consulta de vendas (`São Cristóvão ANIMAL CENTER`), não como segunda empresa. Confirmar com o dono se a filial é outra conta SimplesVet ou o mesmo sistema separado por usuário/unidade.
- Hospedagem do robô: EasyPanel `http://2.25.189.250:3000` (login `louzadaof@gmail.com`). Projeto **`animalcenter`** criado. Em 11/09 apaguei **n8n, n8n-runner, n8n-db e worker-carolinne** pra abrir espaço. Memória caiu de 88% para ~84% (ainda justa).
- Painel local no ar: `http://localhost:5173` — seletor Matriz / Filial 1 / As duas + Vendas, Equipe, Clientes, Vacinas, DRE. Números ainda são demo até o robô ligar.
- O SimplesVet **não sai**. Troca de sistema = conversa do ano que vem.
- BI atual: **octaX** em cima do Power BI da Microsoft (link público). Não é só vendas: são **10 páginas**.
- Atraso: o próprio BI avisa “atualizado quinzenalmente / mensalmente / semanalmente” em várias telas. Carimbo visto em 11/09/2026 11:36. Vacinas travadas em abr–ago/2025. Pesquisa Pangeia **quebrada**.
- Gestor extrai número na mão, apresenta a cada 7 ou 15 dias.
- Time já vê ranking no celular, mas **não tem TV no corredor**.

## Fase 1 (agora) — o que foi combinado

Substituir o BI. Não mexer no SimplesVet.

| Pedido | Por quê |
|---|---|
| Painel ao vivo (não D+1) | Gestor para de puxar número na mão |
| App no celular + tela de TV sem login | Ranking no corredor (endomarketing) |
| Login por pessoa / por área | Luiz reclamou: se der acesso ao BI atual, o time vê tudo |
| Manter o que o BI já mostra | Não perder o que já usam |
| Ticket médio **por cliente** (não por venda) | Único cruzamento que o BI faz e o SimplesVet não faz |
| Duas unidades + aba consolidada | Cada unidade sozinha **e** as duas juntas na DRE |

## Mapa do painel novo (3 visões)

O dono troca de aba. O time, quando tiver login, só vê a unidade/área dele.

```
Novo BI
├─ Unidade Animal Center (Montreal)
│    vendas · ranking · origem · vacina · equipe
├─ Unidade São Cristóvão
│    a mesma coisa, só daquela casa
└─ Consolidado (as duas)
     DRE · faturamento · custo · resultado
     dá pra abrir e ver de qual unidade veio cada linha
```

DRE consolidada = receita das duas (SimplesVet) menos custo das duas (financeiro do SimplesVet + o que hoje está na planilha do gestor). Sem o login da São Cristóvão o consolidado fica cego de um lado.

## Números que o gestor acompanha (tem que estar no painel)

**Dinheiro**
- Faturamento por **recebimento** (fluxo de caixa, não só venda)
- Por grupo: internamento · consultas · exames · cirurgias · farmácia · vacinas
- Comparar dia 10 com dia 10 do mês passado e dos anos anteriores
- Alarme quando um grupo cai abaixo da média histórica
- DRE e custos: entra na mesma plataforma (hoje o BI não tem)

**Pessoas**
- Filtro por veterinário / funcionário
- Ticket médio da pessoa vs o histórico dela
- Atendimentos = consultas + vacinas (hoje soma na mão; entra na remuneração)
- % de cirurgias eletivas vs meta do mês (bonificação)
- Ranking ao vivo na TV do corredor

**Clientes**
- Origem: Instagram, Facebook, Google — **não** o agrupado “redes sociais”
- Cliente novo vs recorrente
- Raça do paciente, gênero do tutor
- Origem de cliente novo vs investimento de mídia

## Fase 2 (depois, visita mensal)

- Automações da rotina de gestão
- Chat com os dados da empresa (pergunta de carro / WhatsApp)
- Relatório semanal automático (eles preferem **ao vivo** no app; o e-mail é extra)
- DRE no detalhe (hoje o gestor junta custo fixo num bloco só; quer linha a linha)
- Troca do SimplesVet: **não agora**

## Comercial (o que foi falado na sala)

- Recorrência atual + R$ 500 ≈ **R$ 2.700/mês** pela plataforma nova + manutenção
- Visita presencial 1x/mês para pegar ideias e ampliar
- Plantão: se travar de manhã, resolve de casa
- IA sobre os dados: custo extra pequeno de provedor (falaram ~US$ 10; confirmar na hora de ligar)

## Leitura dos dados — decisão técnica

O SimplesVet **não publica API** (porta oficial) para terceiro puxar venda em tempo real.
O status deles lista um serviço interno chamado “API”, mas isso é o próprio site conversando com o servidor deles — não é um convite para o nosso painel.

Caminho combinado internamente (ver resposta desta sessão):

1. Pedir à SimplesVet um acesso de **só leitura** (oficial).
2. Enquanto isso, um **robô autorizado** entra com o login da clínica, exporta os mesmos relatórios que o gestor já baixa, a cada 1–5 min.
3. Nosso banco guarda. App, TV e DRE leem do **nosso** banco — nunca direto do SimplesVet.

“Tempo real” nesta clínica = **quase ao vivo (2 min no que muda; o resto mais lento)**.

### Hospedagem (decisão)

```
Robô (sempre ligado)     Cofre              Painel / TV / app
VPS barata            →  Supabase      →   Vercel
entra no SimplesVet      Postgres           Next.js
a cada 2 min             + login por pessoa
```

- **Vercel** não roda o robô (função dorme; navegador não cabe; estoura tempo).
- **Supabase** guarda os dados e o login de cada funcionário. Não liga o robô.
- Cadastro/produtos: 1x por hora. Histórico antigo: 1x por dia. Venda/atendimento/caixa: 2 em 2 min.

## Inventário do BI atual (octaX / Power BI — 10 páginas)

Aberto em 11/09/2026. Unidades no filtro: **Animal Center** e **São Cristóvão** (Montreal provavelmente está como “Animal Center”).

| # | Página | O que tem | Estado |
|---|---|---|---|
| 1 | Vendas | Faturamento, qtd venda, ticket/venda, ticket/cliente, ranking por funcionário, pilares (internamento, consultas, exames, petshop, vacinas, cirurgias, procedimentos), gráfico de conversão | Funciona. Filtros: funcionário, grupo, produto, hora, ano, mês, dia, unidade, origem, status, cliente, plantão |
| 2 | Clientes Pangeia | Tabela crua (pet, tutor, telefone) | Dados pessoais à mostra no link público |
| 3 | Clientes | Mapa, idade/sexo do pet, gênero do tutor (7.366 / 3.777), raça, origem | Aviso: atualiza **quinzenalmente** |
| 4 | Recorrência | Ativo / inativo / pré-inativo, fluxo por hora, novo vs recorrente vs faturamento | Aviso: atualiza **mensalmente** |
| 5 | Fechamento | Consulta, emergência, internação, exame + tabela dia 1–8 vs anos anteriores + ticket/cliente | Ticket/cliente e “recorrentes = 0” quebram no filtro “todos os anos” |
| 6 | Vacinas | Aplicada / vencida / programada por tipo | Aviso: atualiza **semanalmente**. Filtro de data travado em 2025 |
| 7 | Equipe | Matriz desenvolver / +vendas / +ticket / valorizar + ranking | Base do ranking da TV |
| 8 | Cliente recorrente | Lista com telefone por funcionário | Dados pessoais à mostra |
| 9 | Pangeia / pesquisa | NPS / comentários | **Fora do ar** (pede WhatsApp 11 94325-9939 da octaX) |
| 10 | FAT | Uma data (20/05/2026) e um número | Página leftover, não serve |

Pilares de faturamento (histórico aberto): internamento ~R$ 3,0 mi · consultas ~R$ 2,1 mi · exames ~R$ 2,1 mi · petshop ~R$ 0,8 mi · vacinas ~R$ 0,5 mi · cirurgias ~R$ 0,14 mi · procedimentos ~R$ 0,08 mi.

O que o BI **não tem** e a reunião pediu: DRE, custos, login por pessoa, TV no corredor, alerta de queda vs média, origem Instagram/Facebook separado, atendimentos = consulta+vacina, % cirurgia eletiva vs meta, faturamento por **recebimento**.

## Fora de escopo agora

- Reescrever o SimplesVet
- IA dentro do prontuário / receita
- Qualquer senha gravada neste arquivo (não guardar credencial aqui)
