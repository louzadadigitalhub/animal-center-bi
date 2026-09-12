# Animal Center — Sistema Visual

> Navy profundo, gradiente ciano→teal, superfícies elevadas. Clean na estrutura, tecnológico no detalhe — o movimento serve o dado, nunca decora.

**Temas:** escuro (padrão) e claro, com toggle. Preferência em `localStorage` sob a chave `ac-theme`.
**Referência:** dashboard "Personal Finance" (Collect UI) — navy + ciano, cards arredondados, radar de estrutura, donuts com anel grosso, toggle de tema no topo.

## Princípio

Estrutura calma, detalhe vivo. O layout não chama atenção; o **dado** é que se move ao entrar — barra cresce, linha se desenha, número conta. Depois disso, tudo fica parado.

---

## Tokens — Cor

O acento é constante nos dois temas. Só as superfícies e o texto trocam.

### Acento

| Nome | Valor | Token |
|------|-------|-------|
| Ciano | `#3ec8f0` | `--cyan` |
| Teal | `#2ad4c8` | `--teal` |
| Azul | `#4f8ff7` | `--blue` |
| Gradiente 135° | `linear-gradient(135deg, cyan, teal)` | `--grad` |
| Gradiente vertical | `linear-gradient(180deg, cyan, teal)` | `--grad-v` |

`--grad` é a assinatura: botão ativo, barra, trilho preenchido, marca do logo, indicador do dock.

### Superfícies

| Token | Escuro | Claro | Papel |
|-------|--------|-------|-------|
| `--bg` | `#081527` | `#e9eff8` | Canvas |
| `--surface-1` | `#0f2039` | `#ffffff` | Card |
| `--surface-2` | `#16304f` | `#f4f8fd` | Elevado, card de destaque |
| `--surface-3` | `#1d3b61` | `#e6eff9` | Pressionado |
| `--line` | `rgba(125,190,255,.10)` | `rgba(15,45,85,.09)` | Borda |
| `--line-2` | `rgba(125,190,255,.20)` | `rgba(15,45,85,.16)` | Borda em hover/destaque |
| `--edge` | `rgba(255,255,255,.06)` | `rgba(255,255,255,.9)` | Fio de luz no topo do card |

### Texto

| Token | Escuro | Claro | Papel |
|-------|--------|-------|-------|
| `--text` | `#e9f2fe` | `#0f2340` | Títulos, valores |
| `--text-2` | `#9fb6d6` | `#4c6488` | Corpo, células |
| `--text-3` | `#6c86a9` | `#7a91b0` | Rótulos, eixos, legendas |
| `--accent-text` | `#5fd4f5` | `#0c93bd` | Texto sobre o acento — mais fundo no claro para manter contraste |

### Sistema

`--pos` (= `--teal`) · `--neg` `#ff6b81` · `--warn` `#ffb020`

**Nenhum estado depende só de cor.** `.up`/`.down` levam ▲/▼ por `::before`, `.row.warn` e `.alerts li` levam `!`, `.ok` leva ✓, o item ativo da sidebar ganha barrinha em gradiente + peso, o dock ganha traço no topo, `.kpi.warn` ganha faixa interna.

### Barra secundária

`--bar-off-a` / `--bar-off-b` — a barra não-destacada do gráfico de dias. Cor sólida por tema, **não** o acento com alpha: no tema claro um ciano a 30% sumia no branco.

---

## Tokens — Tipografia

| Família | Token | Uso |
|---------|-------|-----|
| **Outfit** | `--font` | Toda a UI |
| **JetBrains Mono** | `--mono` | **Todo número** — KPI, tabela, valor de barra, eixo, delta, legenda, drawer |

Número é sempre mono + `tabular-nums`. É o que alinha coluna de valores e dá a leitura técnica.

| Papel | Tamanho | Peso |
|-------|---------|------|
| Título da página | `clamp(22px, 2.6vw, 28px)` | 600 |
| KPI grande | `clamp(28px, 3.6vw, 36px)` | 600, mono |
| KPI de card | `clamp(21px, 2.7vw, 26px)` | 600, mono |
| Título de card | 15px | 600 |
| Corpo / tabela | 13px | 400 |
| Rótulo caixa alta | 11px, `tracking .12em` | 500 |
| Cabeçalho de tabela | 10px, `tracking .14em` | 600 |

---

## Tokens — Espaço e Forma

**Base 4px.** `--s1` 4 · `--s2` 8 · `--s3` 12 · `--s4` 16 · `--s5` 20 · `--s6` 24 · `--s8` 32 · `--s10` 40

| Elemento | Raio | Token |
|----------|------|-------|
| Card, tile, drawer, TV | 20px | `--r-card` |
| Controle: select, botão, mapa | 12px | `--r-ctl` |
| Badge pequeno | 8px | `--r-sm` |
| Pílula, trilho, segmentado | 999px | `--r-pill` |

### Elevação

`--shadow` (repouso) e `--shadow-lift` (hover) — uma receita cada, por tema. `--glow` é o halo ciano, só em foco de teclado.

Todo card leva um **fio de luz de 1px no topo** (`::before` com `--edge`). É o detalhe que dá o ar de vidro sem usar `backdrop-filter`.

---

## Movimento

| Efeito | Onde | Duração |
|--------|------|---------|
| `rise` em cascata | Cards do `.dash`/`.bento`, 40ms entre eles | 0.55s |
| `growBarY` | Barras do gráfico de dias, sparkline, hora-a-hora — cresce da base, escalonado | 0.6s |
| `growX` | Trilho preenchido de `.row` — cresce da esquerda | 0.75s |
| `draw` | Linha do `LineChart` via `stroke-dashoffset` | 1.1s |
| `<animate>` SMIL | Arco do donut, `stroke-dasharray` de 0 até o valor | 0.9s |
| `popIn` | Polígono do radar, escala a partir do centro | 0.7s |
| Contagem | `useCountUp` nos números grandes, easing cúbico | 0.9s |
| Hover | Card sobe 2px e troca a sombra | 0.18s |
| `slideIn` | Drawer entra pela direita | 0.28s |
| `pulseDot` | Ponto do selo "ao vivo" — **o único loop infinito do sistema** | 2s |

`--ease` é `cubic-bezier(.16,1,.3,1)` em tudo. `prefers-reduced-motion` zera tudo, e o `useCountUp` checa o media query direto antes de animar.

---

## Navegação

Uma superfície por viewport.

| Viewport | Navegação | Filtros globais |
|----------|-----------|-----------------|
| ≥ 800px | `aside` — sidebar persistente, 248px (216px abaixo de 1240px) | `.top`: unidade (pílula segmentada) + ano + mês + toggle de tema |
| < 800px | `.mob-top` (hambúrguer) abre `aside` como gaveta + `.dock` com os 4 mais usados | `.top` acima do conteúdo |

Item ativo da sidebar: lavagem + borda + barrinha em gradiente + peso. No dock: traço em gradiente no topo + cor.

---

## Layout do dashboard

`.dash` são **três colunas, cada uma com o próprio empilhamento** (`.dash-col`).

Isso não é detalhe. Com um único grid de 3 colunas, a altura da linha era a do card mais alto — o card "Receita total" (curto) abria um buraco de ~150px esperando o radar da mesma linha. Colunas independentes empilham por conta própria.

| Coluna | Cards |
|--------|-------|
| 1 | Receita total · Em aberto |
| 2 | Entrada · Recebimentos · Grupos vs média |
| 3 | Estrutura (radar) · Grupos (donut) · Anos |

---

## Gráficos

| Componente | Uso |
|------------|-----|
| `DailyBars` | Caixa por dia. Gridline, eixo, valor no topo. **A barra de maior valor recebe o gradiente cheio**; as outras ficam em `--bar-off-*` |
| `LineChart` | Série mensal. Área em gradiente, linha em gradiente horizontal, ponto em cada mês |
| `Donut` | Parte-do-todo. Anel de fundo em `--track`, fatias com `strokeLinecap: round`, legenda com valor ao lado |
| `Radar` | Participação por grupo. 4 anéis, preenchimento radial, ponto em cada vértice |
| `SparkBars` / `Hourly` | Micro-barras em `--grad-v` |

Todo elemento tem `<title>` — tooltip nativo sem JS. Cor vem de `var(--token)` direto no `fill`/`stroke`: **zero hex solto** fora da rampa categórica `SERIES`.

---

## TV corredor — pódio

Tela passiva, lida de longe. Único lugar do sistema onde a animação é protagonista.

### Metais

| Lugar | Claro | Base | Fundo | Token no `<li>` |
|-------|-------|------|-------|-----------------|
| 1 Ouro | `#fff3b0` | `#ffd54a` | `#e09a16` | `--metal-a/b/c` |
| 2 Prata | `#ffffff` | `#dfe8f2` | `#93a7bd` | idem |
| 3 Bronze | `#ffd9b0` | `#e2934f` | `#a75f26` | idem |

Os metais entram por variável inline no `<li>`; todo o CSS do degrau lê `--metal-*`, então não há regra duplicada por posição.

### Animação (`Podium.jsx`)

| Efeito | Técnica |
|--------|---------|
| Coroa flutua e inclina | `rAF` escrevendo `transform` direto no `<g>` — **sem re-render do React** |
| Brilho atravessa o metal | `rAF` no `gradientTransform` de um `<linearGradient>` sobreposto |
| Faíscas (só no ouro) | `<canvas>` com 22 partículas, estrela de 4 pontas, sobem e apagam |
| Confete do líder | `<canvas>` com 84 partículas, gravidade, estoura **uma vez** e para sozinho |
| Degraus sobem | `podRise`, escalonado 2º → 1º → 3º |
| Valores contam | `useCountUp` a 1400ms |
| Varredura na base do ouro | `sweep`, o único loop além do ponto "ao vivo" |

Cada coroa está em fase diferente (`rank * 0.8`) para não pulsarem em uníssono.

### Ticker único

`anim.jsx` mantém **um** `requestAnimationFrame` para o app inteiro. Componentes assinam via `useRaf`; o loop só roda enquanto houver assinante e se desliga sozinho no último `unsubscribe`.

Isso importa: o pódio tem 3 coroas + 2 canvas. Cinco loops concorrentes seriam desperdício no PC que toca a TV. `useRaf` também não faz nada sob `prefers-reduced-motion` — a coroa fica parada e legível.

### Ordem visual

O DOM renderiza 2º, 1º, 3º — a ordem do pódio de verdade. Abaixo de 760px vira coluna única com o 1º no topo (`order: -1`) e a base vira faixa horizontal.

---

## Responsivo

Refluxo depende da largura do **card**, não da janela — o mesmo componente vive numa coluna de 240px e numa de 900px na mesma tela. `.tile`, `.kpi` e `.card` declaram `container-type: inline-size`.

| Regra | Efeito |
|-------|--------|
| `@container (max-width: 400px)` | `.row` vira duas linhas: nome + valor em cima, barra + % embaixo |
| `@container (max-width: 460px)` | `.donut-wrap` empilha donut sobre legenda |

Breakpoints de janela cuidam do shell: 1240px encolhe a sidebar, 1100px desempilha as grades, 800px troca sidebar por gaveta + dock, 640px enxuga colunas de tabela.

---

## Faça

- `--grad` para ação primária, item ativo e série principal
- Todo número em `--mono` + `tabular-nums`
- Todo estado com **dois sinais no mínimo** (cor + glifo, ou cor + peso, ou cor + faixa)
- Animação só na **entrada** do dado; depois, repouso
- Uma navegação por viewport

## Não faça

- **Sem segundo acento.** Ciano e teal são um gradiente, não duas cores.
- **Sem `backdrop-filter` em card.** Só em barra fixa de mobile e no scrim.
- **Sem animação em loop**, exceto o ponto do selo "ao vivo".
- **Sem hex solto em componente.** Token novo entra no `:root` do `index.css`.
- **Sem depender só de cor** para positivo, negativo, alerta ou ativo.
- **Sem alpha do acento para elemento que precisa ser lido no tema claro.** Use `--bar-off-*`.

---

## Acessibilidade

- `:focus-visible` é contorno de 2px em `--cyan` com 2px de deslocamento
- Alvo de toque mínimo de 44px no mobile
- `prefers-reduced-motion` zera animação e transição
- `color-scheme` por tema, para select e scrollbar nativos acompanharem
- `--accent-text` é mais escuro no tema claro justamente para manter contraste sobre branco

---

## Arquivos

| Arquivo | Conteúdo |
|---------|----------|
| `src/index.css` | `:root` + `[data-theme]` com todos os tokens, shell, componentes, keyframes, container queries |
| `src/seller.css` | Tela do vendedor. **Herda os tokens**, não redeclara nenhum |
| `src/charts.jsx` | SVG lendo `var(--token)` em `fill`/`stroke`, com gradientes e animação de entrada |
| `src/main.jsx` | Aplica `data-theme` do `localStorage` **antes** de renderizar — vale para o dashboard e para `/eu` |
| `src/anim.jsx` | Ticker rAF compartilhado, `useCountUp`, `Num`, `useCanvasSize` |
| `src/Podium.jsx` | Pódio da TV: coroa, faíscas, confete, degraus |
