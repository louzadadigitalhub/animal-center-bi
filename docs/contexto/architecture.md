# Agente de Compras — arquitetura

## Visão geral

O agente é um módulo do serviço `animal-center-bi` (EasyPanel, projeto agrocloss, VPS 147.93.35.196). Ele não tem processo próprio: é uma rota do mesmo servidor Express que serve o painel, e grava no mesmo volume `/data`. O WhatsApp entra por uma Evolution API só da clínica, que é um serviço separado no EasyPanel e não tem nada a ver com a Evolution da Pórtico (`zap.painel.uk`), que fica intocada.

```
Luís (WhatsApp) ──► chip do agente ──► Evolution da clínica (animal-center-zap)
                                              │ webhook (rede interna do Docker)
                                              ▼
                         animal-center-bi  POST /api/compras/whatsapp
                              │  confere segredo e número autorizado
                              ▼
                         agente (Claude, com ferramentas)
                              │  ferramentas leem e gravam o registro;
                              │  as contas de reposição são código, não IA
                              ▼
                         /data/compras/  (catálogo, fornecedores, eventos)
                              │
                              ▼
                         resposta ──► Evolution sendText ──► Luís
```

## Peças

**Evolution da clínica.** Serviço `animal-center-zap` (imagem `evoapicloud/evolution-api`, mesma linha da que a Pórtico usa) com um Postgres próprio `animal-center-zap-db`, os dois no projeto agrocloss, ao lado do painel. Uma instância chamada `compras`, ligada ao chip novo pelo QR code. A chave de API dela é própria. O webhook da instância aponta para o painel pela rede interna (`http://agrocloss_animal-center-bi:8787/api/compras/whatsapp`), então nada passa por endereço público.

**Rota do webhook.** `POST /api/compras/whatsapp` confere um segredo compartilhado (`COMPRAS_WEBHOOK_SEGREDO`), ignora o que não é mensagem de texto recebida, aceita só os números em `COMPRAS_AUTORIZADOS`, responde 200 na hora e processa a mensagem numa fila por conversa, uma de cada vez, para duas mensagens seguidas não se atropelarem.

**Agente.** Uma chamada à API da Anthropic (`ANTHROPIC_API_KEY`, chave da clínica) com o prompt do Luís como instrução de sistema, o histórico curto da conversa e um conjunto de ferramentas. A IA entende o pedido, escolhe a ferramenta e redige a resposta; quantidades, médias, saldos e pendências saem das ferramentas, calculados por código. Mensagem longa é quebrada em partes que caibam no WhatsApp.

**Ferramentas.** `buscar_produto` (casa o nome falado com o catálogo e devolve candidatos quando há dúvida), `registrar` (grava um evento: contagem de estoque, falta, compra planejada, pedido enviado, chegada, consumo, preço novo, mudança de fornecedor, inclusão ou descontinuação de produto), `estado_produto` (saldo confirmado, pedidos a caminho, média e de onde ela veio), `montar_pedido` (mensal ou complementar: sugestões por fornecedor e categoria, pendências e decisões) e `mensagem_fornecedor` (texto pronto para o Luís encaminhar, com telefone só se confirmado).

**Registro.** `/data/compras/catalogo.json` guarda os produtos (nome, categoria, marca, apresentação, unidade, fornecedor escolhido, preço de referência com data e fonte, critério de marca, histórico de compras por mês, cobertura desejada). `/data/compras/fornecedores.json` guarda nome, contato e telefone. `/data/compras/eventos.jsonl` é o caderno: uma linha por atualização, nunca apagada, com data, origem (por exemplo `whatsapp:luis` ou `planilha:2026-07`), tipo, produto, quantidade, unidade, fornecedor e observação. O estado de cada produto é recalculado a partir do caderno, então dá para saber de onde veio cada número.

**Importação.** `bot/compras/importar.py` (Python, porque a leitura de `.numbers` só existe em Python) lê as duas planilhas e o documento de passagem uma vez, monta o catálogo e os fornecedores numa pasta fora do git, e gera um relatório dos nomes que não casaram entre as planilhas, para o Luís conferir. Os arquivos gerados sobem direto para `/data/compras` no servidor. **O repositório é público:** catálogo, preços e telefones de fornecedor nunca entram no git.

## Pastas

```
bot/compras/
  catalogo.js      leitura e busca do catálogo
  registro.js      caderno de eventos e estado derivado
  calculo.js       reposição, cobertura, pendências (puro, testado)
  ferramentas.js   o que o agente pode chamar
  agente.js        conversa com a Claude e o laço de ferramentas
  whatsapp.js      webhook da Evolution e envio de texto
  importar.py      planilhas -> catalogo.json e fornecedores.json (fora do git)
  *.test.js        testes de cada parte
docs/contexto/     este método (prd, architecture, task, memory)
```

## Configuração

No EasyPanel, serviço `animal-center-bi`: `ANTHROPIC_API_KEY` (a clínica cria e cola; ninguém mais vê), `COMPRAS_WEBHOOK_SEGREDO`, `COMPRAS_AUTORIZADOS` (números com DDI, separados por vírgula), `EVOLUTION_URL` (endereço interno da Evolution da clínica), `EVOLUTION_API_KEY` e `EVOLUTION_INSTANCIA` (`compras`).

## Segurança

O agente só responde a números autorizados e só manda mensagem para quem falou com ele. Chaves ficam no servidor. O caderno não guarda dado de paciente nem de tutor. Log de deploy do EasyPanel mostra as variáveis em texto aberto: nunca imprimir sem mascarar.
