# FINORA — Self-Hosting (overview)

FINORA corre como un sistema **self-hosted** sobre tu propia PC, accesible
remotamente vía **Cloudflare Tunnel** (sin port-forwarding ni IP fija).

> **Para instalar desde cero en una PC nueva → leer [`docs/HERMES_INSTALL.md`](./HERMES_INSTALL.md)**
> Ese documento tiene instrucciones paso-a-paso para un setup limpio.

---

## Arquitectura

```
Internet (cualquier Wi-Fi / 4G / 5G)
   │
   ↓ HTTPS
   │
Cloudflare DNS + Tunnel (cloudflared en la PC)
   │
   ↓ outbound-only desde el servidor (NO requiere port-forwarding)
   │
https://finora.tudominio.com → localhost:3000
   │
   ↓
   │
   ┌───────────────────────────────────────┐
   │ FINORA — Next.js 14 │
   │ - NextAuth + bcrypt 12 + rate limit │
   │ - API Routes (todas con auth) │
   │ - Sync Engine (Outbox) │
   └─────────────┬─────────────────────────┘
                 │
                 ↓ prisma
   ┌───────────────────────────────────────┐
   │ PostgreSQL 16 (local) │
   │ 127.0.0.1:5432 ONLY │
   │ finora_app user (no superuser) │
   │ NUMERIC(18,4) para importes │
   │ pg_dump backups automáticos │
   └───────────────────────────────────────┘

   ┌───────────────────────────────────────┐
   │ Sync Worker (proceso separado) │
   │ Lee outbox → escribe Vault │
   │ Con backoff y lock optimista │
   └─────────────┬─────────────────────────┘
                 ↓ atomic write
   ┌───────────────────────────────────────┐
   │ Obsidian Vault (filesystem) │
   │ ${OBSIDIAN_VAULT_PATH}/FINORA/ │
   │ 00 Dashboard/                        │
   │ 01 Transactions/{YYYY}/{MM}/        │
   │ 02 Accounts/                         │
   │ 03 Investments/                      │
   │ 04 Subscriptions/                    │
   │ 05 Budgets/                          │
   │ 06 Debts/                            │
   │ 09 Reports/Monthly/                  │
   │ 99 System/Deleted/                   │
   └───────────────────────────────────────┘
```

---

## Componentes principales

| Componente | Descripción | Docs |
|---|---|---|
| **PostgreSQL 16** | DB local, port 5432 listening en `127.0.0.1` | [`HERMES_INSTALL.md`](./HERMES_INSTALL.md#2-postgresql-local) |
| **Next.js 14 (FINORA)** | App + API + RSC + middleware | [`HERMES_INSTALL.md`](./HERMES_INSTALL.md#4-instalar-finora) |
| **Sync Worker** | Proceso Node que procesa outbox | [`HERMES_INSTALL.md`](./HERMES_INSTALL.md#52-sync-worker) |
| **cloudflared** | Tunnel Cloudflare (outbound-only) | [`HERMES_INSTALL.md`](./HERMES_INSTALL.md#3-cloudflare-tunnel-acceso-remoto) |
| **Obsidian Vault** | Mirror human-readable en disco | [`OBSIDIAN-SYNC.md`](./OBSIDIAN-SYNC.md) |
| **pg_dump** | Backups automáticos | [`BACKUP_RECOVERY.md`](./BACKUP_RECOVERY.md) |

---

## Variables de entorno clave

| Variable | Default | Descripción |
|---|---|---|
| `DATABASE_URL` | (req) | postgresql://finora_app:pass@127.0.0.1:5432/finora |
| `AUTH_SECRET` | (req) | `openssl rand -base64 48` |
| `AUTH_URL` | (req) | `https://finora.tudominio.com` |
| `OBSIDIAN_VAULT_PATH` | (req) | Path absoluto al Vault |
| `FINORA_BACKUP_PATH` | (req) | Path absoluto para pg_dump |
| `TZ` | `UTC` | Timezone (ej: `America/Argentina/Buenos_Aires`) |
| `NEXT_PUBLIC_BASE_CURRENCY` | `ARS` | Moneda por defecto |
| `FINORA_BOOTSTRAP_ENABLED` | `false` | one-shot para primer usuario |
| `PG_DUMP_PATH` | `pg_dump` | Path absoluto al binario |
| `PG_RESTORE_PATH` | `pg_restore` | Path absoluto al binario |
| `SYNC_INTERVAL_MS` | `5000` | Cada cuánto el worker procesa |

Ver todas en [`.env.example`](../.env.example).

---

## Comandos principales

```bash
# Desarrollo local
npm run dev

# Producción
npm run build
npm run start

# Base de datos
npx prisma migrate deploy    # aplicar migrations
npm run db:init-prod          # crear primer usuario (interactivo)

# Obsidian Sync
npm run sync:worker           # loop infinito
npm run sync:once             # procesar lote y salir
npm run obsidian:reports      # regenerar Dashboard + Monthly
npm run obsidian:import       # importar cambios desde Vault

# Vault
npm run vault:rebuild         # regenerar Vault desde DB
npm run vault:restore:dry     # preview restore from Vault
npm run vault:restore         # REAL restore (con confirmación)
npm run vault:integrity       # comparar counts DB vs Vault

# Backups
npm run backup:pg             # pg_dump → FINORA_BACKUP_PATH
npm run backup:verify         # verificar integridad del último dump
npm run restore:pg -- --file=./backups/X.dump   # restaurar
```

Ver lista completa en [`package.json`](../package.json).

---

## Seguridad

- **Autenticación**: NextAuth v5 + bcrypt 12 + JWT
- **Cookies**: `__Secure-` prefix + httpOnly + Secure + SameSite=Lax en prod
- **Rate limiting**: 5 fallos/15min email + 30 fallos/15min IP
- **Passwords**: mín 12 chars + mayusc + minusc + número + símbolo
- **Headers**: CSP estricta, HSTS preload, X-Frame-Options DENY
- **DB**: NO expuesta a Internet (listen_addresses=127.0.0.1)
- **No public signup**: `/api/bootstrap` one-shot, desactiva tras primer usuario
- **Noindex**: `<meta robots="noindex,nofollow">` + robots.txt bloquea todos
- **Service Worker**: NO cachea HTML ni /api/*, sólo assets estáticos whitelisted

Ver threat model completo en [`SECURITY.md`](./SECURITY.md).

---

## PWA desde iPhone

1. Safari → `https://finora.tudominio.com`
2. Login
3. Compartir → Añadir a pantalla de inicio
4. Aparece ícono FINORA en home screen
5. Abre en modo standalone (sin barra Safari)
6. Funciona desde **cualquier red**: Wi-Fi de casa, 4G/5G, universidad, etc

---

## Recovery ante desastres

Ver [`DISASTER_RECOVERY.md`](./DISASTER_RECOVERY.md) para escenarios:

1. **FINORA rompe, DB funciona** → reinstalar app + conectar DB
2. **Postgres rompe, Vault funciona** → restaurar DB desde Vault
3. **Vault borrado, DB funciona** → regenerar Vault
4. **Servidor muere** → reinstalar en PC nueva + restaurar backup
5. **Cloudflare falla** → app sigue funcionando localmente

---

## Documentación completa

- [`HERMES_INSTALL.md`](./HERMES_INSTALL.md) — **install en PC limpia**
- [`OBSIDIAN-SYNC.md`](./OBSIDIAN-SYNC.md) — arquitectura del sync engine
- [`BACKUP_RECOVERY.md`](./BACKUP_RECOVERY.md) — estrategia de backups
- [`DISASTER_RECOVERY.md`](./DISASTER_RECOVERY.md) — runbooks de recovery
- [`SECURITY.md`](./SECURITY.md) — threat model completo
- [`../README.md`](../README.md) — overview general