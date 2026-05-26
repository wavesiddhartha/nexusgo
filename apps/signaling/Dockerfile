# ── Multi-stage Docker build for NEXUS signaling ──────────────────────────────
FROM node:20-slim AS base
RUN npm i -g pnpm@9

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml* ./
COPY packages/shared/package.json  ./packages/shared/
COPY apps/signaling/package.json   ./apps/signaling/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/signaling/node_modules  ./apps/signaling/node_modules
COPY . .
RUN pnpm --filter @nexus/signaling build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/signaling/dist ./dist
COPY --from=deps    /app/node_modules        ./node_modules
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:8787/health || exit 1
CMD ["node", "dist/server.js"]
