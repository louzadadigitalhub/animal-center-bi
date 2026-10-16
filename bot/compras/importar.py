"""Importa as planilhas de compras para o catálogo do agente.

Uso (na máquina que tem as planilhas; precisa de numbers-parser):
    python importar.py --fornecedores "Tabela para pedidos - 4 fornecedores.numbers" \
        --compras "Compras internas.numbers" --passagem "Passagem_de_Funcao.docx" --saida PASTA

Gera em PASTA: catalogo.json, fornecedores.json e relatorio.md (o que não
casou entre as duas planilhas e o que virou observação). O repositório é
público: a PASTA fica fora do git e os arquivos sobem direto para
/data/compras no servidor.

Regras herdadas do PRD: histórico de compra não é consumo; estoque de
planilha não é saldo confirmado; preço de julho/2026 é referência.
"""

import argparse
import datetime as dt
import json
import re
import unicodedata
import zipfile
from pathlib import Path

MESES = {"janeiro": 1, "fevereiro": 2, "marco": 3, "abril": 4, "maio": 5, "junho": 6, "julho": 7,
         "agosto": 8, "setembro": 9, "outubro": 10, "novembro": 11, "dezembro": 12,
         "jan": 1, "fev": 2, "mar": 3, "abr": 4, "mai": 5, "jun": 6, "jul": 7, "ago": 8,
         "set": 9, "out": 10, "nov": 11, "dez": 12}

# Aba -> (categoria, ano das colunas que só têm o nome do mês, cobertura em meses)
ABAS = {
    "Pedido interno - Cirurgica": ("Cirúrgica", 2026, 1),
    "Farmácia": ("Farmácia", None, 3),
    "Injetáveis interno": ("Injetáveis", None, 1),
    "Fios cirúrgicos": ("Fios cirúrgicos", None, 1),
    "Testes rápidos": ("Testes rápidos", None, 1),
    "Idexx": ("Idexx", None, 1),
    "Vacinas": ("Vacinas", None, 1),
    "Limpeza": ("Limpeza", None, 1),
}
CRITERIOS = [
    (re.compile(r"\bcat[eé]ter", re.I), "Nipro", "cateter somente Nipro"),
    (re.compile(r"ringer|fisiol[oó]gic", re.I), "JP", "solução fisiológica e Ringer lactato somente JP"),
]
PALAVRAS_FORA = {"de", "da", "do", "com", "c", "un", "und", "unidade", "cx", "caixa", "bolsa", "frasco",
                 "fr", "pct", "pacote", "e", "para", "ll", "s", "sem", "a", "o", "em"}


def sem_acento(s):
    return "".join(c for c in unicodedata.normalize("NFD", str(s)) if unicodedata.category(c) != "Mn")


def limpo(s):
    return re.sub(r"\s+", " ", str(s or "")).strip()


def chave(s):
    return sem_acento(limpo(s)).lower()


def numero(v):
    if v in (None, "", "-"):
        return None
    try:
        return float(str(v).replace(",", "."))
    except ValueError:
        return None


def mes_da_coluna(rotulo, ano_padrao):
    """'2026-09', 'dez/24', 'abril/25', 'janeiro', 45627 (serial do Excel) -> 'aaaa-mm'."""
    r = sem_acento(str(rotulo)).strip().lower()
    m = re.fullmatch(r"(\d{4})-(\d{2})", r)
    if m:
        return f"{m[1]}-{m[2]}"
    m = re.fullmatch(r"([a-z]+)\s*/\s*(\d{2,4})", r)
    if m and m[1][:3] in MESES:
        ano = int(m[2]) + (2000 if len(m[2]) == 2 else 0)
        return f"{ano}-{MESES[m[1][:3]]:02d}"
    if r in MESES and ano_padrao:
        return f"{ano_padrao}-{MESES[r]:02d}"
    n = numero(r)
    if n and 40000 < n < 60000:  # data serial do Excel
        d = dt.date(1899, 12, 30) + dt.timedelta(days=int(n))
        return f"{d.year}-{d.month:02d}"
    return None


def tokens(nome):
    t = chave(nome).replace(",", ".")
    t = re.sub(r"(\d)\s+(ml|mg|g|l|cm|mm|ui|%)\b", r"\1\2", t)
    partes = re.findall(r"[a-z0-9.%]+", t)
    return {p.strip(".") for p in partes if (p not in PALAVRAS_FORA and len(p) > 1) or re.match(r"\d", p)}


TAMANHOS = {"pp", "p", "m", "g", "gg", "xg", "xgg"}


def numeros(tk):
    """Só o número de cada medida: 22G e 22 são o mesmo calibre; 0,9% vira 0.9."""
    return {re.match(r"\d+(?:\.\d+)?", p).group(0) for p in tk if re.match(r"\d", p)}


def tamanho(nome):
    achados = {t for t in re.findall(r"[a-z]+", chave(nome)) if t in TAMANHOS}
    return achados or None


def nome_principal(nome):
    for p in re.findall(r"[a-z]+", chave(nome)):
        if len(p) >= 3 and p not in PALAVRAS_FORA:
            return p
    return ""


def mesmo_nome(a, b):
    if not a or not b:
        return False
    if a == b or (min(len(a), len(b)) >= 5 and (a.startswith(b) or b.startswith(a))):
        return True
    if min(len(a), len(b)) < 6:
        return False
    # Alfaepoietina x Alfaepoetina: até duas letras de diferença em palavra longa.
    d = [[i + j if not i * j else 0 for j in range(len(b) + 1)] for i in range(len(a) + 1)]
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] != b[j - 1]))
    return d[-1][-1] <= 2


APRESENTACAO = re.compile(
    r"^(litro|l|spray|rolo|fr\.?|frasco|compr\.?|comprimidos?|cx|caixa|un|und|unidade|bolsa|ampola|amp\.?|"
    r"tampa\b.*|vit\b.*|pomada|gotas|sache|pct|pacote|galao|tubo|cartela|blister|solucao|suspensao|xarope|"
    r"injetavel|po|marca nao informada)$"
)


def marca(nome):
    """O trecho depois do último ' - ', quando parece marca (não apresentação nem medida)."""
    if " - " not in nome:
        return None
    m = limpo(nome.rsplit(" - ", 1)[1])
    if not m or re.search(r"\d", m) or APRESENTACAO.match(chave(m)):
        return None
    return m


def parecido(a, b):
    """0 quando o remédio, o tamanho ou a medida não batem; senão 0,5 + metade da sobreposição."""
    if not mesmo_nome(nome_principal(a), nome_principal(b)):
        return 0.0
    sa, sb = tamanho(a), tamanho(b)
    if sa and sb and sa != sb:
        return 0.0
    ta, tb = tokens(a), tokens(b)
    na, nb = numeros(ta), numeros(tb)
    menor, maior = (na, nb) if len(na) <= len(nb) else (nb, na)
    if menor and not menor <= maior:
        return 0.0
    return 0.5 + 0.5 * len(ta & tb) / len(ta | tb)


def ler_tabelas(caminho):
    from numbers_parser import Document

    doc = Document(caminho)
    saida = {}
    for sheet in doc.sheets:
        for table in sheet.tables:
            linhas = []
            for r in table.rows(values_only=True):
                linha = [("" if v is None else (v.strftime("%Y-%m") if hasattr(v, "strftime") else v)) for v in r]
                if any(str(v).strip() for v in linha):
                    linhas.append(linha)
            saida[sheet.name] = linhas
    return saida


def eh_observacao(nome, valores):
    n = chave(nome)
    tem_dado = any(numero(v) is not None for v in valores)
    return (not tem_dado) and bool(
        n.startswith("*") or "contato" in n or "diretamente" in n or re.search(r"\(\d{2}\)", n) or "produtos de limpez" in n
    )


def importar_compras(tabelas):
    produtos, observacoes = [], []
    for aba, (categoria, ano, cobertura) in ABAS.items():
        linhas = tabelas.get(aba) or []
        cab_i = next((i for i, r in enumerate(linhas) if chave(r[0]).startswith("materiais")), None)
        if cab_i is None:
            continue
        cab = [limpo(c) for c in linhas[cab_i]]
        idx = {chave(c): i for i, c in enumerate(cab) if c}
        col_mes = {i: mes_da_coluna(c, ano) for i, c in enumerate(cab)}
        col_mes = {i: m for i, m in col_mes.items() if m}
        # Testes rápidos: a primeira coluna diz "nov/25", mas a seguinte é 2024-12 (serial do Excel).
        ordem = sorted(col_mes)
        for k in range(len(ordem) - 1):
            i1, i2 = ordem[k], ordem[k + 1]
            if col_mes[i1] > col_mes[i2] and col_mes[i2] < max(col_mes.values()):
                y, mm = map(int, col_mes[i2].split("-"))
                y, mm = (y - 1, 12) if mm == 1 else (y, mm - 1)
                if f"{y}-{mm:02d}" not in col_mes.values():
                    col_mes[i1] = f"{y}-{mm:02d}"
        for r in linhas[cab_i + 1:]:
            nome = limpo(r[0])
            if not nome:
                continue
            valores = r[1:]
            if eh_observacao(nome, valores):
                observacoes.append(f"{categoria}: {nome}")
                continue
            hist = {}
            for i, m in col_mes.items():
                q = numero(r[i]) if i < len(r) else None
                if q is not None and q > 0:
                    hist[m] = q
            p = {
                "nome": nome,
                "categoria": categoria,
                "fornecedor": (limpo(r[idx["fornecedor"]]) or None) if "fornecedor" in idx else None,
                "historicoCompras": dict(sorted(hist.items())),
                "coberturaMeses": cobertura,
                "coberturaConfirmada": False,
                "obs": [],
            }
            if "pedido realizado" in idx and idx["pedido realizado"] < len(r):
                anot = limpo(r[idx["pedido realizado"]])
                if anot and numero(anot) is None:
                    p["obs"].append(f"anotação na planilha: {anot}")
            if "estoque" in idx and idx["estoque"] < len(r):
                est = numero(r[idx["estoque"]])
                if est is not None:
                    p["estoquePlanilha"] = {"qtd": est, "fonte": f"planilha Compras internas, aba {aba}", "data": "desconhecida"}
            produtos.append(p)
    # Validades e estoques soltos da aba Planilha1
    validades = {}
    for r in tabelas.get("Planilha1") or []:
        nome = limpo(r[0])
        if not nome or chave(nome).startswith("materiais"):
            continue
        validades[chave(nome)] = (limpo(r[1]) if len(r) > 1 else "", numero(r[2]) if len(r) > 2 else None)
    for p in produtos:
        v = validades.get(chave(p["nome"]))
        if v:
            if v[0] and v[0] != "-":
                p["validade"] = v[0]
            if v[1] is not None and "estoquePlanilha" not in p:
                p["estoquePlanilha"] = {"qtd": v[1], "fonte": "planilha Compras internas, aba Planilha1", "data": "desconhecida"}
    return produtos, observacoes


def importar_precos(tabelas):
    linhas = tabelas.get("Melhores preços") or []
    itens, secao = [], None
    for r in linhas:
        nome = limpo(r[0])
        if not nome or chave(nome).startswith(("comparativo", "criterios", "a coluna", "produto e marca", "itens sem")):
            continue
        if limpo(r[2]) == "Quantidade":
            secao = nome.split(" - ")[0]
            continue
        if not limpo(r[2]) and numero(r[3]) is None:
            secao = nome.split(" - ")[0]
            continue
        itens.append({
            "nome": nome,
            "fornecedor": limpo(r[4]) or secao,
            "precoRef": {"valor": numero(r[3]), "referente": limpo(r[2]) or None, "data": "2026-07",
                         "fonte": "Tabela para pedidos - 4 fornecedores (comparativo de julho/2026)"},
        })
    sem = []
    for r in tabelas.get("Sem cotação válida") or []:
        nome = limpo(r[0])
        if nome and not chave(nome).startswith(("itens sem", "produto")):
            sem.append({"nome": nome, "motivo": limpo(r[1]) if len(r) > 1 else ""})
    return itens, sem


def importar_fornecedores(docx):
    if not docx:
        return []
    xml = zipfile.ZipFile(docx).read("word/document.xml").decode("utf-8")
    saida = []
    for tr in re.findall(r"<w:tr[ >].*?</w:tr>", xml, re.S):
        celulas = ["".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", tc)).strip() for tc in re.findall(r"<w:tc>.*?</w:tc>", tr, re.S)]
        if len(celulas) == 3 and re.search(r"\(\d{2}\)\s*\d", celulas[2]):
            saida.append({"nome": celulas[0], "contato": None if celulas[1] in ("—", "-", "") else celulas[1],
                          "telefone": celulas[2], "fonte": "documento de passagem de função (set/2026)"})
    return saida


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", chave(s)).strip("-")[:60]


def montar(compras, precos, sem_cotacao):
    # Melhores pares primeiro, no conjunto todo: a ordem da planilha não decide.
    candidatos = sorted(
        ((parecido(p["nome"], q["nome"]), i, j) for i, p in enumerate(compras) for j, q in enumerate(precos)),
        reverse=True,
    )
    usados_c, usados, pares = set(), set(), []
    for nota, i, j in candidatos:
        if nota < 0.55:
            break
        if i in usados_c or j in usados:
            continue
        usados_c.add(i)
        usados.add(j)
        p, q = compras[i], precos[j]
        p["nomeNaTabelaDePrecos"] = q["nome"]
        p["precoRef"] = q["precoRef"]
        p["fornecedor"] = p["fornecedor"] or q["fornecedor"]
        p["casamento"] = round(nota, 2)
        # Marca diferente entre as planilhas, ou casamento fraco: o agente
        # não assume — vira pendência para o Luís confirmar.
        ma, mb = marca(p["nome"]), marca(q["nome"])
        if ma and mb and chave(ma) not in chave(mb) and chave(mb) not in chave(ma):
            p["conferir"] = f"marca diferente: planilha de compras '{ma}', tabela de preços '{mb}'"
        elif nota < 0.75:
            p["conferir"] = f"casamento fraco ({round(nota, 2)}): confirmar se '{q['nome']}' é a mesma apresentação"
        pares.append((p["nome"], q["nome"], round(nota, 2)))
    so_precos = [dict(q, categoria="Suprimentos (só na tabela de preços)", historicoCompras={},
                      coberturaMeses=1, coberturaConfirmada=False, obs=[])
                 for j, q in enumerate(precos) if j not in usados]
    catalogo = compras + so_precos
    sem_por_nome = {chave(s["nome"]): s for s in sem_cotacao}
    vistos = set()
    for p in catalogo:
        base = slug(p["nome"]) or "produto"
        pid, n = base, 2
        while pid in vistos:
            pid, n = f"{base}-{n}", n + 1
        vistos.add(pid)
        p["id"] = pid
        for padrao, marca_exigida, texto in CRITERIOS:
            if padrao.search(p["nome"]):
                p["criterio"] = texto
                p["marcaObrigatoria"] = marca_exigida
        hist = p.get("historicoCompras") or {}
        if hist:
            p["mediaCompraMensal"] = round(sum(hist.values()) / len(hist), 2)
            p["mesesComCompra"] = len(hist)
            p["ultimaCompra"] = max(hist)
        if chave(p["nome"]) in sem_por_nome:
            p["semCotacaoValida"] = sem_por_nome[chave(p["nome"])]["motivo"]
    for s in sem_cotacao:
        if not any(chave(p["nome"]) == chave(s["nome"]) for p in catalogo):
            pid = slug(s["nome"])
            while pid in vistos:
                pid += "-x"
            vistos.add(pid)
            catalogo.append({"id": pid, "nome": s["nome"], "categoria": "Sem cotação válida",
                             "historicoCompras": {}, "coberturaMeses": 1, "coberturaConfirmada": False,
                             "obs": [], "semCotacaoValida": s["motivo"]})
    return catalogo, pares, so_precos


def relatorio(catalogo, pares, so_precos, compras, observacoes, fornecedores):
    sem_preco = [p for p in compras if "precoRef" not in p]
    duvidosos = [x for x in pares if x[2] < 0.75]
    linhas = [
        "# Importação das planilhas de compras",
        "",
        f"Catálogo com {len(catalogo)} produtos; {len(pares)} casados entre as duas planilhas; "
        f"{len(so_precos)} só na tabela de preços; {len(sem_preco)} só na planilha de compras (sem preço de referência); "
        f"{len(fornecedores)} fornecedores do documento de passagem.",
        "",
        f"## Casamentos para conferir ({len(duvidosos)} com nota abaixo de 0,75)",
        "",
        "| Planilha de compras | Tabela de preços | Nota |",
        "|---|---|---|",
        *[f"| {a} | {b} | {n} |" for a, b, n in sorted(duvidosos, key=lambda x: x[2])],
        "",
        "## Só na tabela de preços (sem histórico de compras)",
        "",
        *[f"- {p['nome']} ({p.get('fornecedor') or 'sem fornecedor'})" for p in so_precos],
        "",
        "## Só na planilha de compras (sem preço de referência)",
        "",
        *[f"- {p['categoria']}: {p['nome']}" for p in sem_preco],
        "",
        "## Linhas que viraram observação (não são produto)",
        "",
        *[f"- {o}" for o in observacoes],
    ]
    return "\n".join(linhas) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fornecedores", required=True)
    ap.add_argument("--compras", required=True)
    ap.add_argument("--passagem")
    ap.add_argument("--saida", required=True)
    a = ap.parse_args()
    compras, observacoes = importar_compras(ler_tabelas(a.compras))
    precos, sem = importar_precos(ler_tabelas(a.fornecedores))
    fornecedores = importar_fornecedores(a.passagem)
    catalogo, pares, so_precos = montar(compras, precos, sem)
    out = Path(a.saida)
    out.mkdir(parents=True, exist_ok=True)
    meta = {"geradoEm": dt.datetime.now().isoformat(timespec="seconds"), "fontes": [Path(a.compras).name, Path(a.fornecedores).name]}
    (out / "catalogo.json").write_text(json.dumps({**meta, "produtos": catalogo}, ensure_ascii=False, indent=1), "utf-8")
    (out / "fornecedores.json").write_text(json.dumps({**meta, "fornecedores": fornecedores}, ensure_ascii=False, indent=1), "utf-8")
    (out / "relatorio.md").write_text(relatorio(catalogo, pares, so_precos, compras, observacoes, fornecedores), "utf-8")
    print(f"catalogo: {len(catalogo)} | casados: {len(pares)} | so preco: {len(so_precos)} | fornecedores: {len(fornecedores)} | observacoes: {len(observacoes)}")


if __name__ == "__main__":
    main()
