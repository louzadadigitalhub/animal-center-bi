"""Regras do importador que não podem voltar a falhar. Rodar: python -m unittest bot/compras/test_importar.py"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from importar import marca, mes_da_coluna, parecido  # noqa: E402


class Casamento(unittest.TestCase):
    def test_remedio_diferente_nao_casa(self):
        # 16/10/2026: "injetável ampola" em comum fazia fenobarbital casar com furosemida.
        self.assertEqual(parecido("Fenobarbital injetável ampola", "Furosemida injetável ampola - Hypofarma"), 0.0)
        self.assertGreater(parecido("Fenobarbital injetável ampola", "Fenobarbital injetável 40 mg/ml - 20 ml - Cristália Fenocris"), 0.55)

    def test_tamanho_e_calibre(self):
        self.assertEqual(parecido("Luva procedimento s/ pó P cx", "Luva de procedimento sem talco M - Medix"), 0.0)
        self.assertEqual(parecido("Catéter 22 Nipro cx", "Cateter intravenoso 24G - Nipro"), 0.0)
        self.assertGreater(parecido("Catéter 22 Nipro cx", "Cateter intravenoso 22G - Nipro"), 0.55)

    def test_grafia_parecida(self):
        self.assertGreater(parecido("Alfaepoietina 4.000 ui/ml - frasco", "Alfaepoetina 4.000 UI/ml - Blau"), 0.55)


class Marca(unittest.TestCase):
    def test_apresentacao_nao_e_marca(self):
        for nome in ["Álcool 70% - litro", "Removex - spray", "trazodona 50mg - compr.", "Coletor de urina - tampa vermelha"]:
            self.assertIsNone(marca(nome), nome)
        self.assertEqual(marca("Propofol frasco - Baxter"), "Baxter")


class Meses(unittest.TestCase):
    def test_formatos_de_coluna(self):
        self.assertEqual(mes_da_coluna("2026-09", None), "2026-09")
        self.assertEqual(mes_da_coluna("dez/24", None), "2024-12")
        self.assertEqual(mes_da_coluna("abril/25", None), "2025-04")
        self.assertEqual(mes_da_coluna("março", 2026), "2026-03")
        self.assertEqual(mes_da_coluna("45627.0", None), "2024-12")
        self.assertIsNone(mes_da_coluna("Estoque", None))


if __name__ == "__main__":
    unittest.main()
