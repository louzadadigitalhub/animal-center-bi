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

ENV BUILD_MARK=grafico-20260912c
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

CMD ["node", "bot/server.js"]
