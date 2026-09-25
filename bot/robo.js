/* O robo roda aqui, num processo separado do site.

   Ate 24/09 ele rodava dentro do mesmo processo do servidor web. Tudo o
   que ele faz de pesado — Chromium, agregar 100 mil vendas, reescrever o
   snapshot, reprocessar o historico para achar gente nova — acontecia no
   mesmo fio que responde as paginas. Enquanto o robo trabalhava o site
   ficava lento; quando o robo travou, o site caiu junto e ficou mais de
   um dia sem responder nem a /api/version.

   Agora o servidor abre este processo a cada ciclo, recebe o resultado
   por mensagem e o processo termina. A memoria volta ao sistema no fim
   de cada ciclo, e se algo aqui travar o servidor mata e segue de pe.

   ROBO_DRE=1 pede tambem o demonstrativo. ROBO_DESDE=dd/mm/aaaa limita o
   historico baixado (teste, ou uma coleta leve feita a mao); sem ele vale
   o padrao do scrape, tres anos para tras. */
import { scrape } from "./scrape.js";
import { syncPeopleFromSales } from "./people.js";

const avisar = (msg) => {
  try {
    process.send?.(msg);
  } catch {
    /* o servidor ja foi embora; nada a fazer */
  }
};
const texto = (err) => String(err && err.stack ? err.stack : err);

/* Erro de login ou de rede: o DRE usa a mesma porta de entrada e so
   repetiria a falha, custando mais um Chromium. */
const LOGIN_MORTO = /login\.php|Timeout \d+ms exceeded|net::ERR|SIMPLES_VET_EMAIL|Page crashed/i;

let erroScrape = null;
try {
  const r = await scrape(process.env.ROBO_DESDE ? { from: process.env.ROBO_DESDE } : {});
  avisar({ tipo: "scrape", ok: true, r });
  /* Gente nova aparece aqui, no ciclo, e nao quando alguem abre a tela
     de login. Relê e reprocessa o historico inteiro — por isso mora no
     processo do robo e nao no do site. */
  await syncPeopleFromSales().catch((e) => console.error("sync gente fail", String(e?.message || e)));
} catch (err) {
  erroScrape = texto(err);
  avisar({ tipo: "scrape", ok: false, erro: erroScrape });
}

if (process.env.ROBO_DRE === "1") {
  if (erroScrape && LOGIN_MORTO.test(erroScrape)) {
    avisar({ tipo: "dre", ok: false, pulado: true, erro: "login do SimplesVet falhou neste ciclo" });
  } else {
    try {
      const { collectDre } = await import("./collect-dre.js");
      const agoraBr = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
      const r = await collectDre(agoraBr.getFullYear(), process.env.DATA_DIR);
      avisar({ tipo: "dre", ok: true, r });
    } catch (err) {
      avisar({ tipo: "dre", ok: false, erro: String(err?.message || err) });
    }
  }
}

/* Da tempo para a ultima mensagem sair pelo canal antes de encerrar. */
setTimeout(() => process.exit(0), 200);
