# FINORA — Security Model

## Threat model

FINORA es una aplicación personal single-user. El threat model es:

| Amenaza | Mitigación |
|---|---|
| Descubrimiento de la URL | `noindex`, `robots.txt`, sin landing pública, sin sitemap |
| Brute force en login | Rate limit 5/15min por email + 30/15min por IP, bcrypt 12 rounds |
| Sesión robada (cookie hijack) | `__Secure-` prefix + `Secure` flag + `httpOnly` + `SameSite=Lax` |
| CSRF en APIs | NextAuth JWT con SameSite=Lax, validado server-side en cada request |
| XSS | CSP estricta + no `unsafe-eval` + React escape por default |
| Clickjacking | `X-Frame-Options: DENY` + `frame-ancestors 'none'` |
| MITM | HSTS preload + HTTPS-only en prod |
| Data leakage via SW cache | SW whitelist: sólo `/icons/`, `/_next/static/`, fonts. Nunca HTML ni APIs |
| SQL injection | Prisma ORM con queries parametrizadas (nunca string interpolation) |
| Broken auth | Validación Zod en cada endpoint + `userId` ownership en todas las queries |
| Information disclosure en errores | Mensajes genéricos al cliente + log detallado server-side |
| Logging de datos financieros | NO se loguean importes ni descripciones |
| Resource exhaustion | Headers de CSP + límites de tamaño implícitos de Vercel |

---

## Authentication

### Stack

- **NextAuth v5 (Auth.js)** con provider Credentials
- **JWT firmado** con `AUTH_SECRET` (HS256)
- **Bcrypt 12 rounds** para passwords
- **Cookie de sesión**: `__Secure-authjs.session-token` (prod) / `authjs.session-token` (dev)
- **SameSite=Lax**, **HttpOnly=true**, **Secure=true** en producción
- **Expiración**: 12 horas (uso diario cómodo)
- **Refresh**: cada 1h si la sesión está activa

### Login flow

```
1. POST /api/auth/callback/credentials
2. Validate Zod schema (email + password ≥ 8 chars)
3. Rate limit check (5 failures/15min per email, 30 per IP)
5. Lookup user by email
6. Bcrypt.compare(password, user.passwordHash)
7. If valid: sign session token, set cookie
8. Log attempt (success/failure) to LoginAttempt table
```

### Rate limiting

Persistente en DB (modelo `LoginAttempt`):

- **5 intentos fallidos / 15 min por email** → bloqueo 15 min
- **30 intentos fallidos / 15 min por IP** → bloqueo 1 hora
- Limpieza opportunista de intentos > 24h

### Password requirements

- Mínimo 12 caracteres (en producción vía `npm run db:init-prod`)
- Al menos una minúscula
- Al menos una mayúscula
- Al menos un número
- Al menos un símbolo
- Sin espacios
- Bcrypt con cost 12 (~150ms por hash en hardware moderno)

### Session lifecycle

```
Login → JWT firmado (8h) → Cookie httpOnly secure →
  → Cada request verifica cookie → JWT válido →
  → session.user propagado a páginas/APIs →
  → Logout invalida cookie + redirect /login
```

JWT NO se persiste en DB. Si necesitás revocación inmediata, pasá a sesiones DB-backed (work para futuro).

---

## Authorization

**Defense in depth** (todas las capas son obligatorias):

### Capa 1: Edge Middleware

`src/middleware.ts` chequea presencia de cookie de sesión. Si no existe → redirect a `/login`.

No usa `auth()` completo (sería pesado en Edge) — sólo valida que la cookie existe.

### Capa 2: Server Components / API Routes

Cada página/API llama a `auth()` de NextAuth:

```typescript
const session = await auth();
if (!session?.user) redirect("/login");
```

### Capa 3: Ownership validation

Toda query incluye `where: { id, userId: session.user.id }`:

```typescript
const tx = await prisma.transaction.findFirst({
  where: { id: txId, userId: session.user.id }
});
if (!tx) return 404; // existe O no es tuyo → mismo response
```

No se distingue entre "no existe" y "no es tuyo" para evitar enumeration.

### Capa 4: Validación de input

`Zod` valida TODO input del cliente. Falla → 400 con issues detallados (que NO leakuean estructura interna).

---

## Data storage

### PostgreSQL

- Provider: Postgres 16 (Neon / Supabase / Railway)
- Connection: SSL obligatorio (`sslmode=require`)
- Connection pooling: provider-managed (Neon pooler, Supabase pooler)

### Decimal precision

Todos los importes monetarios usan `NUMERIC(18, 4)` en Postgres, wrappeado en `Prisma.Decimal` en Node.

```sql
-- 18 dígitos totales, 4 decimales
-- Máximo: 999.999.999.999,9999 (cubre cualquier patrimonio)
NUMERIC(18,4)
```

Esto evita errores clásicos de floating point:
```js
// ❌ JavaScript nativo
0.1 + 0.2 = 0.30000000000000004

// ✅ Prisma.Decimal
new Decimal('0.1').plus('0.2').toString() === '0.3'
```

Cantidades de inversión usan `NUMERIC(24, 8)` para soportar fracciones como 0.015 BTC.

### No se loguean

- Importes
- Descripciones de transacciones
- Emails (excepto en logs de error con fines de debug)
- Passwords (nunca)
- Respuestas de APIs autenticadas

---

## Service Worker security

El SW (`public/sw.js`) tiene una **whitelist explícita** de qué cachear:

✅ **Cacheable**:
- `/_next/static/*` (JS/CSS bundles)
- `/icons/*` (PWA assets)
- `/manifest.json`
- `https://fonts.googleapis.com` y `fonts.gstatic.com`

❌ **NUNCA cacheado**:
- HTML (páginas con datos autenticados)
- `/api/*` (datos financieros)
- Cualquier GET no listado explícitamente

### Modo offline

Si el usuario está offline:
- HTML: muestra la página `/offline` estática
- API: devuelve 503 con `{ error: "offline" }`
- Assets estáticos: sirven desde cache

No se persiste NINGÚN dato financiero en el cache.

---

## Security headers

Aplicados vía `next.config.mjs` y `vercel.json`:

```http
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; manifest-src 'self'

Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=()
X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex
```

### CSP explicada

- `default-src 'self'`: nada de recursos externos por default
- `script-src 'self' 'unsafe-inline'`: Next.js requiere inline scripts para hydration. Tailwind requiere inline styles.
- `frame-ancestors 'none'`: nadie puede embeber FINORA en iframe
- `connect-src 'self'`: APIs son sólo same-origin (no CORS abierto)
- `object-src 'none'`: no plugins Flash/Java

### HSTS

`Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`

Browsers que ven este header **nunca** intentarán HTTP, sólo HTTPS. `preload` permite enviar el dominio a la lista de preload de Chrome (https://hstspreload.org).

---

## No indexación

```html
<meta name="robots" content="noindex,nofollow,nocache">
<meta name="googlebot" content="noindex,nofollow,noarchive,nosnippet,noimageindex">
```

```
# /robots.txt
User-agent: *
Disallow: /
```

- No hay sitemap.xml
- No hay landing pública
- No hay páginas accesibles sin sesión
- El único entry point público es `/login`

---

## Privacidad por privacidad mode

Toggle en UI (`/Mas`) y en header. Persiste en:
- `localStorage` (inmediato en cliente)
- `User.privacyMode` en DB (entre sesiones y dispositivos)

Cuando está activo:
- Todos los importes se reemplazan por `$ ••••••`
- Afecta dashboard, transacciones, cuentas, inversiones, suscripciones, presupuestos, deudas, export

NO se oculta:
- Conteos (# de cuentas, # de transacciones)
- Nombres de cuentas / categorías
- Gráficos estructurales (sólo se ofuscan los labels numéricos)

---

## Auditoría / logs

Por ahora NO hay tabla de audit log. Si lo necesitás en el futuro:

```prisma
model AuditEvent {
  id        String   @id @default(cuid())
  userId    String
  action    String   // LOGIN, LOGOUT, CREATE_TX, DELETE_TX, ...
  metadata  Json?
  ip        String?
  userAgent String?
  createdAt DateTime @default(now())
}
```

Para esta versión personal, los logs de Vercel son suficientes (no contienen datos financieros).

---

## Checklist pre-producción

Antes del primer deploy a producción:

- [ ] `AUTH_SECRET` generado con `openssl rand -base64 48` (NO el dev default)
- [ ] `AUTH_URL` apunta a la URL de prod (HTTPS)
- [ ] `DATABASE_URL` apunta a Postgres administrado (Neon/Supabase/Railway)
- [ ] SSL habilitado en DB (`?sslmode=require` en connection string)
- [ ] `FINORA_BOOTSTRAP_ENABLED=true` SOLO durante el primer usuario
- [ ] Bootstrap ejecutado → usuario creado
- [ ] `FINORA_BOOTSTRAP_ENABLED=false` después
- [ ] Test login desde un dispositivo externo
- [ ] Test login desde otra red (datos móviles)
- [ ] PWA install en iPhone
- [ ] robots.txt y headers verificados con `curl -I`
- [ ] `/api/health` devuelve 200
- [ ] Backup inicial exportado (JSON)

---

## Próximas mejoras de seguridad (opcionales)

| Feature | Beneficio | Esfuerzo |
|---|---|---|
| 2FA TOTP (otplib) | Segunda capa de auth | Bajo |
| Passkeys (WebAuthn) | Sin password, biometría | Medio |
| Session DB + revocación | Logout forzado de otros devices | Bajo |
| Audit log | Saber qué se hizo y cuándo | Bajo |
| Hardware key (YubiKey) | Máxima seguridad física | Bajo (post WebAuthn) |
| Cloudflare Access | 2da capa de red, OTP email | Bajo |
| Trusted IPs en DB | Limitar a redes conocidas | Bajo (post WebAuthn) |
| Encrypted backups (GPG) | Backups cifrados en reposo | Bajo |