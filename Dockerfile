# syntax=docker/dockerfile:1
# Flowdeck: one image serving the API, WebSocket and the built web client.
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
# Optional: trust an extra CA during the build (TLS-inspecting proxies), e.g.
#   docker build --secret id=extra_ca,src=/path/to/ca.pem .
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm ci --no-audit --no-fund
COPY vite.config.ts ./
COPY server ./server
COPY web ./web
COPY migrations ./migrations
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=8080 \
    FLOWDECK_DATA_DIR=/data \
    FLOWDECK_WEB_DIR=/app/dist/web
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server/index.js"]
