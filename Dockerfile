FROM mcr.microsoft.com/playwright:v1.55.0-noble

WORKDIR /app

COPY web/package.json web/package-lock.json web/
RUN cd web && npm ci

COPY bot/package.json bot/package-lock.json bot/
RUN cd bot && npm ci --omit=dev

COPY web/ web/
RUN cd web && npm run build

COPY bot/ bot/

ENV NODE_ENV=production
ENV PORT=80
ENV DATA_DIR=/data
ENV WEB_DIR=/app/web/dist
ENV SCRAPE_MS=120000
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

VOLUME ["/data"]

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=8s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||80)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "bot/server.js"]
