# Agente de Compras — decisões

**2026-10-16 — Canal é o WhatsApp, num chip novo só do agente.** O Luís conversa com ele como contato; o número da clínica continua só da recepção, sem conversa misturada.

**2026-10-16 — Evolution própria da clínica, não a da Pórtico.** O dono pediu para não misturar com a Pórtico (`zap.painel.uk`). Sobe um serviço Evolution só da clínica no EasyPanel, ao lado do painel.

**2026-10-16 — Chave de IA da clínica.** O dono cria a chave e cola direto no EasyPanel, para o custo ficar separado e a chave não passar por conversa nenhuma.

**2026-10-16 — O agente roda dentro do animal-center-bi.** Reaproveita deploy, volume `/data`, login e permissões do painel; uma futura aba Compras lê o mesmo caderno.

**2026-10-16 — Código calcula, IA conversa.** Quantidade sugerida, média, saldo e pendência saem de funções testadas. A IA não inventa número: ela chama a ferramenta e redige.

**2026-10-16 — Atualização vira evento, nunca sobrescreve.** O caderno é só de acréscimo, com data e origem, para sempre dar para dizer de onde veio um saldo.

**2026-10-16 — Repositório é público: dado de compras fica fora do git.** O GitHub `louzadadigitalhub/animal-center-bi` é público. Catálogo, preços e telefones de fornecedor são gerados numa pasta local e sobem direto para `/data/compras` no servidor; só o importador e a documentação entram no repositório.

**2026-10-16 — Casamento de nomes entre as planilhas é estrito.** Na primeira rodada, "Fenobarbital ampola" casou com "Furosemida ampola" e "Luva P" com "Luva M". Agora o nome principal, o tamanho e a medida têm de bater, e os melhores pares são escolhidos no conjunto todo. Marca diferente (Propofol: Baxter na planilha de compras, União Química na de preços) e casamento fraco (30 itens) viram "conferir", que o agente mostra como pendência em vez de assumir.
