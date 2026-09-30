# ============================================================
# FINORA — Dockerfile (multi-stage production build)
# ============================================================
# Stage 1: deps + build
# Stage 2: runtime minimal (no dev deps, no test files)
# ============================================================

# ============================================================
# Stage 1: build
# ============================================================
FROM node:20-bookworm-slim AS builder

# Instalar OpenSSL (requerido por Prisma engines)
RUN apt-get update -y && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar manifests primero para cache de layers
COPY package.json package-lock.json* ./
RUN npm ci

# Copiar schema de Prisma y generar cliente
COPY prisma ./prisma
RUN npx prisma generate

# Copiar resto del código
COPY . .

# Build de Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ============================================================
# Stage 2: runtime
# ============================================================
FROM node:20-bookworm-slim AS runner

# OpenSSL para Prisma, postgresql-client para pg_dump/pg_restore,
# wget para el healthcheck
RUN apt-get update -y && apt-get install -y --no-install-recommends \
    openssl ca-certificates postgresql-client wget \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Copiar artefactos de build (no node_modules de dev)
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json

# Crear usuario no-root para runtime (seguridad)
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs finora

# Directorios donde FINORA necesita escribir (si se usan paths internos)
RUN mkdir -p /app/var/vault /app/var/backups \
 && chown -R finora:nodejs /app

USER finora

EXPOSE 3000

# Healthcheck usa el endpoint interno (asume AUTH_SECRET presente)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["npx", "next", "start", "-p", "3000", "-H", "0.0.0.0"]