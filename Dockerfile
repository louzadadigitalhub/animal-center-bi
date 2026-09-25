FROM mcr.microsoft.com/playwright:v1.55.0-noble

WORKDIR /app

ENV PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright

COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci

COPY bot/package.json bot/package-lock.json bot/
RUN mkdir -p /root/.cache \
  && if [ -d /ms-playwright ]; then ln -sfn /ms-playwright /root/.cache/ms-playwright; fi \
  && cd bot && npm ci --omit=dev \
  && npx playwright install chromium

ENV BUILD_MARK=robo-separado-dre-pagos-20260925a
COPY web/ web/
RUN cd web && npm run build

COPY bot/ bot/

ENV NODE_ENV=production
ENV TZ=America/Sao_Paulo
ENV PORT=8787
ENV DATA_DIR=/data
ENV WEB_DIR=/app/web/dist
ENV SCRAPE_MS=120000

VOLUME ["/data"]

EXPOSE 8787

# Em 24/09 o processo congelou sem morrer: o Docker so reinicia quem
# sai, entao o painel ficou mais de um dia fora sem ninguem perceber.
# Com o healthcheck, cinco falhas seguidas (uns 5 minutos sem responder a
# rota mais leve que existe) fazem o Swarm trocar o container. Folgado de
# proposito: nesta VPS ate abrir um node novo pode demorar, e um reinicio
# a toa custa um ciclo inteiro do robo (30-40 min).
# start-period cobre o boot, quando o primeiro ciclo do robo ja comeca.
HEALTHCHECK --interval=60s --timeout=30s --start-period=180s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/version').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "bot/server.js"]
