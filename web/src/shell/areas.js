/* Areas do menu e as abas de cada uma, como no painel de referencia: a barra
   lateral mostra a area, a fileira de abas mostra as paginas dentro dela.

   O id de cada aba e o mesmo id de pagina de sempre (vendas, dre, tv...).
   E por ele que o servidor libera ou nao a pagina para cada conta
   (perfis.json), entao nao muda: so o agrupamento e novo.

   "painel" e a visao geral: le o mesmo snapshot de Vendas, por isso pede a
   permissao de vendas e nao uma propria. */
import { SquaresFour } from "@phosphor-icons/react/SquaresFour";
import { ChartBar } from "@phosphor-icons/react/ChartBar";
import { UsersThree } from "@phosphor-icons/react/UsersThree";
import { PawPrint } from "@phosphor-icons/react/PawPrint";
import { CurrencyDollar } from "@phosphor-icons/react/CurrencyDollar";
import { ShieldCheck } from "@phosphor-icons/react/ShieldCheck";

export const AREAS = [
  {
    id: "painel",
    label: "Painel",
    icon: SquaresFour,
    abas: [{ id: "painel", label: "Visão geral", pede: "vendas" }],
  },
  {
    id: "vendas",
    label: "Vendas",
    icon: ChartBar,
    abas: [
      { id: "vendas", label: "Visão geral" },
      { id: "comparativo", label: "Comparativo" },
      { id: "ritmo", label: "Ritmo do dia" },
    ],
  },
  {
    id: "equipe",
    label: "Equipe",
    icon: UsersThree,
    abas: [
      { id: "equipe", label: "Desempenho" },
      { id: "veterinarios", label: "Veterinários" },
      { id: "tv", label: "Ranking" },
    ],
  },
  {
    id: "clientes",
    label: "Clientes",
    icon: PawPrint,
    abas: [
      { id: "clientes", label: "Perfil" },
      { id: "recorrencia", label: "Recorrência" },
      { id: "vacinas", label: "Vacinas" },
      { id: "pesquisa", label: "Pesquisa" },
    ],
  },
  {
    id: "financeiro",
    label: "Financeiro",
    icon: CurrencyDollar,
    abas: [
      { id: "dre", label: "DRE" },
      { id: "dashboard", label: "Dashboard" },
      { id: "contas", label: "Contas a pagar" },
    ],
  },
];

export const AREA_ADMIN = { id: "admin", label: "Admin", icon: ShieldCheck, abas: [{ id: "admin", label: "Admin" }] };

/* Area de uma pagina. Pagina desconhecida cai na primeira area. */
export function areaDe(pagina, areas) {
  return areas.find((a) => a.abas.some((b) => b.id === pagina)) || areas[0];
}

/* So as areas e abas que a conta pode ver. Area sem aba nenhuma some. */
export function areasVisiveis(podeVer, admin) {
  const lista = AREAS.map((a) => ({ ...a, abas: a.abas.filter((b) => podeVer(b.pede || b.id)) })).filter((a) => a.abas.length);
  return [...lista, ...(admin ? [AREA_ADMIN] : [])];
}
