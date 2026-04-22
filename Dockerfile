# ── Stage 1: build the React client ─────────────────────────────────────
FROM node:25-alpine AS client-build

WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci --legacy-peer-deps
COPY client/ ./
RUN VITE_API_URL="" npm run build

# ── Stage 2: compile the TypeScript server ──────────────────────────────
FROM node:25-alpine AS server-build

WORKDIR /app/server
COPY server/package*.json ./
COPY server/tsconfig.json ./
RUN npm ci --legacy-peer-deps
COPY server/src-new/ ./src-new/
COPY server/src/ ./src/
RUN npm run build

# ── Stage 3: runtime image (production deps only) ───────────────────────
FROM node:25-alpine

WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev --legacy-peer-deps

COPY --from=server-build /app/server/dist ./server/dist
COPY --from=client-build /app/client/build ./client/build

# Run as non-root
RUN addgroup -S theoria && adduser -S theoria -G theoria \
    && mkdir -p /home/theoria/.theoria \
    && chown -R theoria:theoria /app /home/theoria
USER theoria

ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||4000)+'/health/live',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

EXPOSE 4000

CMD ["node", "server/dist/index.js"]
