# FINORA — Deployment Guide (Producción)

FINORA está diseñado para deployarse como:

```
Internet
   ↓
Cloudflare Access (opcional, 2da capa) — recomendado
   ↓
Vercel (HTTPS automático, serverless Next.js)
   ↓
PostgreSQL (Neon, Supabase, Railway u otro administrado)
```

---

## 1. Pre-requisitos

- Cuenta en **Vercel** (free tier alcanza para uso personal)
- Cuenta en **Neon** (o Supabase / Railway) — DB Postgres administrada
- Dominio propio (recomendado para producción, ej: `finora.tu-dominio.com`)
- Node.js 20+ y npm localmente (para `prisma generate` y deploys manuales)

---

## 2. Crear la base de datos

### Opción A: Neon (recomendado)

1. Ir a https://neon.tech y crear cuenta
2. Crear nuevo proyecto:
   - Name: `finora-prod`
   - Region: la más cercana a tu Vercel region (`us-east-1` por defecto)
   - Postgres version: 16
3. Copiar la **Connection string**:
   ```
   postgresql://user:pass@ep-xxx.us-east-1.aws.neon.tech/finora?sslmode=require
   ```

### Opción B: Supabase

1. Crear proyecto en https://supabase.com
2. Settings → Database → Connection string (modo "Transaction")
3. Usar el puerto 6543 (pooler) o 5432 (direct)

---

## 3. Configurar variables de entorno en Vercel

Ir a **Project Settings → Environment Variables** y agregar:

| Variable | Valor | Notas |
|---|---|---|
| `DATABASE_URL` | (la connection string de Neon) | Para producción |
| `AUTH_SECRET` | `openssl rand -base64 48` | 48 bytes random, OBLIGATORIO |
| `AUTH_URL` | `https://finora.tu-dominio.com` | Sin trailing slash |
| `NODE_ENV` | `production` | |
| `NEXT_PUBLIC_BASE_CURRENCY` | `ARS` o `USD` | |
| `NEXT_PUBLIC_USD_ARS_FALLBACK` | `1450` | Cotización inicial fallback |
| `FINORA_BOOTSTRAP_ENABLED` | `true` (temporal) | **DESACTIVAR después del primer usuario** |
| `FINORA_BOOTSTRAP_EMAIL` | `tu@email.com` | Sólo durante el bootstrap |
| `FINORA_BOOTSTRAP_PASSWORD` | tu contraseña fuerte | Mín 12 chars, mayusc, minusc, número, símbolo |

> ⚠️ **IMPORTANTE**: Las credenciales de bootstrap son la única forma de crear el primer usuario en prod. Una vez creado, desactivar `FINORA_BOOTSTRAP_ENABLED=false` y rotar la contraseña.

---

## 4. Deploy inicial

### 4.1 Conectar repo

```bash
# (si todavía no inicializaste git en el repo)
git init
git add .
git commit -m "FINORA ready for deploy"

# conectar con Vercel
npm i -g vercel
vercel login
vercel link
```

O usar el dashboard de Vercel → "Add New Project" → conectar repo de GitHub.

### 4.2 Configurar build

Vercel detecta Next.js automáticamente. El `vercel.json` ya define:

```json
{
  "buildCommand": "prisma generate && prisma migrate deploy && next build",
  "framework": "nextjs"
}
```

> `prisma migrate deploy` aplica las migraciones SQL automáticamente en cada deploy.

### 4.3 Primer deploy

```bash
vercel --prod
```

Vercel va a:
1. Instalar deps (`npm ci`)
2. Generar Prisma client
3. Aplicar migraciones (`prisma migrate deploy`)
4. Build de Next.js
5. Deploy serverless functions

---

## 5. Bootstrap del primer usuario

Una vez deployado:

```bash
curl -X POST https://finora.tu-dominio.com/api/bootstrap
```

O ejecutar localmente apuntando a la DB de prod:

```bash
DATABASE_URL="postgresql://..." FINORA_BOOTSTRAP_ENABLED=true \
  FINORA_BOOTSTRAP_EMAIL="tu@email.com" \
  FINORA_BOOTSTRAP_PASSWORD="TuPassFuerte!2024" \
  npm run db:init-prod
```

### Verificar

```bash
curl https://finora.tu-dominio.com/api/health
# → {"status":"ok","db":"ok","timestamp":"..."}
```

### DESACTIVAR bootstrap inmediatamente

En Vercel env vars: `FINORA_BOOTSTRAP_ENABLED=false` → redeploy.

Después de esto:
- Nadie puede crear usuarios nuevos desde la app
- No hay route `/signup`
- Sólo vos con tus credenciales podés entrar

---

## 6. Configurar dominio personalizado

### Opción A: Dominio Vercel (`*.vercel.app`)

Por defecto Vercel te da `finora-xxxxx.vercel.app`. Funciona out-of-the-box con HTTPS.

### Opción B: Dominio custom (recomendado para prod)

1. En Vercel → Domains → Add: `finora.tu-dominio.com`
2. Vercel te da los DNS records a configurar en tu registrar
3. Vercel emite automáticamente un certificado Let's Encrypt
5. HTTPS queda activo en minutos

> **HTTP → HTTPS**: Vercel hace redirect automático.

### Actualizar AUTH_URL

```
AUTH_URL=https://finora.tu-dominio.com
```

Redeploy para que NextAuth use la URL correcta.

---

## 7. Cloudflare Access (capa opcional)

Cloudflare Access agrega una segunda capa de autenticación DELANTE de FINORA.

### Cuándo activarlo

- Si te preocupa que la URL sea descubierta (no debería: noindex + robots)
- Si querés un log auditable de quién intentó acceder
- Si querés exigir 2FA adicional (Cloudflare soporta TOTP, OTP email)

### Setup

1. **Tener dominio custom en Cloudflare** (no en Vercel DNS)
2. **Mover nameservers** del dominio a Cloudflare
3. En Cloudflare → Zero Trust → Access → Applications → Add:
   - **Application name**: FINORA
   - **Domain**: `finora.tu-dominio.com`
   - **Session duration**: 24 hours
4. **Policy**:
   - **Name**: Solo yo
   - **Action**: Allow
   - **Include** → **Emails**: `tu@email.com`
   - **Require** → **One-Time PIN** (OTP email) o **TOTP** (authenticator)
5. (Opcional) Service Auth → añadir un `CF-Access-Client-Id` header que la app verifica

### Después de activarlo

- FINORA login aparece DESPUÉS de Cloudflare Access
- Cualquier persona que no seas vos recibe 403 directamente en Cloudflare
- Tu email queda como audit log

> **Si decidís no usar Cloudflare Access**: FINORA sigue siendo seguro gracias a:
> - Auth propia con JWT firmado
> - Rate limiting (5 intentos fallidos / 15min por email)
> - Bcrypt 12 rounds en passwords
> - Headers de seguridad
> - robots.txt + noindex global

---

## 8. PWA en iPhone (instalación)

Una vez deployado:

1. Abrir Safari en iPhone → `https://finora.tu-dominio.com`
2. Login con tus credenciales
3. Tocar el botón **Compartir** (icono cuadrado con flecha hacia arriba)
4. Scroll down → **"Añadir a pantalla de inicio"**
5. Confirmar nombre "FINORA" → Agregar

Resultado:
- Ícono FINORA en la home screen
- Abre en modo **standalone** (sin barra Safari)
- Sesión persiste entre sesiones
- Funciona desde **cualquier red** (Wi-Fi, 4G/5G, otra Wi-Fi, roaming)

---

## 9. Verificación final

```bash
# 1. Health check
curl https://finora.tu-dominio.com/api/health

# 2. Login funciona
# (abrir en navegador, completar form)

# 3. Privacy mode toggleable

# 4. Export JSON contiene todos los datos
# (en /mas → Exportar → JSON)

# 5. Robots bloquea indexación
curl https://finora.tu-dominio.com/robots.txt
# → User-agent: *\nDisallow: /

# 6. No hay sitemap público
curl https://finora.tu-dominio.com/sitemap.xml
# → 404

# 7. Verificar headers de seguridad
curl -I https://finora.tu-dominio.com/login
# → X-Frame-Options: DENY
# → Strict-Transport-Security: max-age=63072000; ...
# → X-Content-Type-Options: nosniff
```

---

## 10. Backups

### Manuales (built-in)

- En `/mas` → "Exportar mis datos" → JSON (completo) o CSV (transacciones)
- Frecuencia recomendada: semanal

### Automáticos del proveedor

- **Neon**: plan Free incluye 7 días de retention; plan Launch ($19/mo) incluye 30 días
- **Supabase**: 7 días en plan Free
- Configurar backups automáticos del proveedor según tu SLA deseado

### Recomendación

1. Exportar JSON mensualmente desde la app y guardar en disco cifrado
2. Configurar backups automáticos de Neon o Supabase
3. Documentar el procedimiento de restore (próximamente)

---

## 11. Costos estimados

| Servicio | Plan | Costo |
|---|---|---|
| Vercel | Hobby | $0 (límite: serverless functions) |
| Neon | Free | $0 (0.5 GB storage, 190h compute/mes) |
| Dominio custom | Varía | ~$10-15/año |
| Cloudflare Access | Free hasta 50 usuarios | $0 |

**Total para uso personal**: ~$10-15/año.

---

## 12. Troubleshooting

### Build falla por Prisma

```
Error: P1001 Can't reach database server
```
**Solución**: `DATABASE_URL` no apunta a DB accesible. Verificar connection string.

### Login falla inmediatamente

- Verificar que `AUTH_SECRET` está set (32+ chars)
- Verificar que `AUTH_URL` coincide con la URL del deployment
- Revisar logs en Vercel → Functions → ver stack trace

### Bootstrap no funciona

- `FINORA_BOOTSTRAP_ENABLED` debe ser exactamente `"true"` (string)
- Después del primer usuario el endpoint devuelve 409 (esperado)
- Si ya existe un usuario y querés resetear: `prisma migrate reset` (DESTRUYE TODOS LOS DATOS)

### Sesión se cierra constantemente

- Verificar cookies en DevTools: deben ser `__Secure-authjs.session-token`
- Si no, las cookies `Secure` no están activadas (NODE_ENV=production)

---

## 13. Próximos pasos opcionales

- **2FA TOTP**: agregar librería `otplib` + QR setup en `/mas`
- **Passkeys / WebAuthn**: agregar `simplewebauthn`
- **API de cotizaciones**: integrar dolarapi.com o similar para auto-refresh de USD/ARS
- **Snapshots automáticos**: cron nocturno en Vercel que persiste patrimonio
- **Recurring transactions runner**: cron que crea tx recurrentes cuando vence

Todos estos cambios son compatibles con el schema actual.