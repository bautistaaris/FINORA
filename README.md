# FINORA

> Aplicación privada de finanzas personales. Mobile-first. PWA. HTTPS. PostgreSQL. Multi-moneda.

FINORA es una herramienta personal para registrar y analizar gastos, ingresos,
inversiones, suscripciones, transferencias, ahorros, deudas y presupuestos desde
el teléfono. **Accesible desde cualquier red** (cualquier Wi-Fi, 4G/5G, otra casa,
viajes), pero completamente **privada** (autenticación obligatoria + sin
registro público + noindex global).

---

## ✨ Quick look

- **Stack**: Next.js 14 · React 18 · TypeScript strict · Tailwind 3 · Prisma 5 · PostgreSQL
- **Auth**: NextAuth v5 + bcrypt 12 + JWT + rate limiting persistente
- **PWA**: instalable en iPhone/Android, modo standalone
- **Privacy**: privacy mode, robots.txt, noindex, headers de seguridad completos
- **Money**: NUMERIC(18,4) en Postgres, Prisma.Decimal en código (sin floating point)

---

## 🚀 Setup local

### Opción A — PostgreSQL via Docker (recomendado)

```bash
docker run -d --name finora-postgres \
  -e POSTGR_PASSWORD=finora \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=finora \
  -p 5432:5432 \
  postgres:16-alpine

git clone <repo> finora
cd finora
npm install
cp .env.example .env
# generar AUTH_SECRET:
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
# pegar en .env
npx prisma migrate deploy
npm run db:seed   # crea usuario demo + datos ficticios (sólo en dev)
npm run dev
```

Login dev: `owner@finora.local` / `finora-demo-2024`

### Opción B — SQLite (sólo dev rápido, NO producción)

Si necesitás una DB sin Docker:

```bash
# Backup del schema prod
cp prisma/schema.prisma prisma/schema.postgres.prisma

# Activar schema SQLite (Float, sin NUMERIC)
cp prisma/schema.dev.prisma prisma/schema.prisma

# Apuntar a SQLite
DATABASE_URL="file:./dev.db" npx prisma db push
DATABASE_URL="file:./dev.db" npm run db:seed

npm run dev
```

⚠️ **SQLite no soporta NUMERIC nativo**. El schema dev usa Float (riesgo de floating point). **Nunca** usar en producción.

---

## 📦 Deploy a producción

Ver **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** para la guía completa.

Resumen:

1. Crear DB Postgres (Neon free tier recomendado)
2. Conectar repo a Vercel
3. Setear env vars: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`
4. `FINORA_BOOTSTRAP_ENABLED=true` + email/password en env (temporal)
5. Deploy → `curl -X POST https://tu-dominio.com/api/bootstrap`
6. DESACTIVAR bootstrap (`FINORA_BOOTSTRAP_ENABLED=false`)
7. Listo: accesible desde cualquier red via HTTPS

**Costo**: ~$0–15/año (Vercel free + Neon free + dominio opcional)

---

## 🔐 Seguridad

Ver **[docs/SECURITY.md](docs/SECURITY.md)** para el threat model completo.

Highlights:
- Auth obligatoria en TODA ruta no-pública
- Rate limiting: 5 fallos/15min por email, 30 por IP
- Bcrypt 12 rounds
- Password mínimo 12 chars + complejidad
- JWT firmado con AUTH_SECRET
- Cookies `__Secure-` + HttpOnly + SameSite=Lax en prod
- HSTS preload + CSP estricta
- SW whitelist: nunca cachea HTML ni APIs autenticadas
- `noindex` global + robots.txt
- Validación Zod + ownership check en cada endpoint

---

## 🧪 Comandos

| Comando | Acción |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run start` | Servidor de producción |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript strict |
| `npm run test` | Vitest (27 tests) |
| `npm run db:migrate` | Crear/aplicar migración (dev) |
| `npm run db:deploy` | Aplicar migraciones a prod |
| `npm run db:seed` | Seed DEV (no en prod) |
| `npm run db:init-prod` | Crear usuario prod inicial |
| `npm run db:studio` | Prisma Studio UI |

---

## 🏗 Arquitectura

```
Internet
   ↓ (HTTPS)
Cloudflare Access (opcional, 2da capa)
   ↓
Vercel (serverless Next.js)
   ├─ /api/* (route handlers)
   ├─ / (RSC pages)
   └─ Middleware (auth check, headers)
   ↓
Neon Postgres (NUMERIC(18,4))
```

**Capas**:
- `src/app/` — Rutas + RSC pages + API routes
- `src/lib/finance.ts` — Lógica financiera (Decimal)
- `src/lib/auth.ts` — NextAuth config
- `src/lib/rate-limit.ts` — Rate limiting persistente
- `src/lib/db.ts` — Prisma client
- `src/middleware.ts` — Edge auth + headers
- `src/components/` — UI reusable
- `prisma/schema.prisma` — Schema de DB

---

## 💰 Modelo de datos

13 modelos relacionales con `NUMERIC(18,4)` para todos los importes:

- **User** (single-user, sin signup público)
- **Account** (7 tipos)
- **Transaction** (4 tipos: EXPENSE/INCOME/TRANSFER/INVESTMENT)
- **Category** (EXPEX/INCOME)
- **Investment** + **InvestmentTransaction** (historial completo)
- **Subscription** (5 frecuencias)
- **Budget** (mensual por categoría)
- **Debt** (para cálculo de patrimonio)
- **RecurringTransaction** (schema, runner pendiente)
- **NetWorthSnapshot** (histórico)
- **Settings** (preferencias)
- **ExchangeRate** (cotizaciones manuales)
- **LoginAttempt** (rate limiting)

Patrimonio neto = `Σ cuentas + Σ inversiones − Σ deudas activas`,
siempre convirtiendo a moneda base primero.

---

## 📱 PWA en iPhone

1. Abrir Safari → `https://tu-dominio.com`
2. Login con credenciales
3. Compartir → "Añadir a pantalla de inicio"
4. Resultado: ícono FINORA, abre en standalone, sesión persistente

Funciona desde **cualquier red**: Wi-Fi de casa, datos móviles, Wi-Fi del trabajo, roaming.

---

## 📊 Features

**Core**:
- Gastos, ingresos, transferencias, inversiones
- Cuentas con saldos en múltiples monedas
- Inversiones con P/L y distribución
- Suscripciones con costo mensual/anual equivalente
- Presupuestos mensuales con progreso
- Deudas (activos vs pasivos)
- Cálculo de patrimonio neto

**Analytics**:
- Dashboard con KPIs del mes
- Flujo semanal
- Distribución por categoría
- Próximos cobros
- Tasa de ahorro

**UX**:
- Privacy mode (ocultar importes)
- Bottom sheets modales
- Bottom nav + FAB para Quick Add
- Filtros avanzados (cuenta, moneda, importe)
- Búsqueda full-text
- Empty states / loading skeletons
- Soporte completo de teclado móvil

**PWA**:
- Manifest válido (theme-color, standalone, icons 192/512 + maskable)
- Service worker (sólo assets públicos, NO HTML ni APIs autenticadas)
- `/offline` fallback

**Export**:
- CSV (transacciones)
- JSON completo (backup)

---

## 🧪 Tests

`npm run test` ejecuta **27 tests** sobre:
- Cash flow mensual (income/expense/balance/savingsRate)
- Patrimonio neto con multimoneda
- P/L de inversiones (incl. edge cases)
- Transferencias con conversion
- Costo mensual/anual de suscripciones por frecuencia
- Progreso de presupuestos (incl. overflow)
- Conversión de moneda con rate inversa
- Formateo locale-aware

---

## 🚧 Limitaciones actuales

- **Recharts** en deps pero no usado activamente (dashboard usa SVG inline). Quitar si querés.
- **RecurringTransaction** schema listo pero NO hay cron que ejecute. Documentado para futuro.
- **No OCR de recibos** ni integración con bancos (por diseño — todo manual).
- **No i18n** (sólo español). Estructura lista para `next-intl`.
- **Sin 2FA TOTP todavía** — schema y AUTH_SECRET listos. Fácil de agregar con `otplib`.
- **Passkeys/WebAuthn** — pendiente para próxima iteración.

---

## 📜 Licencia

Privado. No redistribuir.