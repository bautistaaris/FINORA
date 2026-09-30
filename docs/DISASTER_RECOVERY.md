# FINORA — Disaster Recovery

Este documento describe cómo recuperar FINORA ante distintos escenarios de fallo.

---

## Escenarios cubiertos

| # | Escenario | Solución |
|---|---|---|
| 1 | FINORA rompe pero DB funciona | Reinstalar FINORA y conectar a Postgres |
| 2 | PostgreSQL rompe pero Vault funciona | Reconstruir DB desde Vault |
| 3 | Vault se borra pero DB funciona | Regenerar Vault desde DB |
| 4 | Servidor completo muere | Reinstalar + restaurar Postgres + Vault backup |
| 5 | Cloudflare Tunnel falla | FINORA sigue funcionando localmente |
| 6 | Internet del servidor cae | Postgres + Vault siguen funcionando localmente |

---

## Escenario 1: FINORA rompe pero DB funciona

**Síntomas**: la app no arranca (error de Next.js, dependencias rotas, etc).
La DB Postgres sigue intacta.

**Recuperación**:

```bash
# 1. Reinstalar código FINORA
cd /opt/finora
git pull   # o git clone de backup
npm ci

# 2. Verificar .env (DATABASE_URL correcto)
cat .env

# 3. Regenerar cliente Prisma
npx prisma generate

# 4. Aplicar migraciones (idempotente)
npx prisma migrate deploy

# 5. Rebuild + restart
npm run build
systemctl restart finora
```

**Verificación**:
```bash
curl http://localhost:3000/api/health
```

**Tiempo estimado**: 5–15 minutos.

---

## Escenario 2: PostgreSQL rompe pero Vault funciona

**Síntomas**: Postgres no arranca, datos corruptos, DB eliminada.
El Vault está intacto en disco.

**Recuperación**:

```bash
# 1. Restaurar Postgres (instalar nueva versión si es necesario)
sudo apt install postgresql-16

# 2. Crear DB vacía
sudo -u postgres psql
postgres=# CREATE USER finora_app WITH PASSWORD '...';
postgres=# CREATE DATABASE finora OWNER finora_app;
postgres=# \q

# 3. Aplicar schema
cd /opt/finora
DATABASE_URL=... npx prisma migrate deploy

# 4. Crear usuario admin (bootstrap)
DATABASE_URL=... FINORA_BOOTSTRAP_ENABLED=true \
  FINORA_BOOTSTRAP_EMAIL="tu@email.com" \
  FINORA_BOOTSTRAP_PASSWORD="..." \
  npm run db:init-prod

# 5. Restaurar datos desde Vault
DATABASE_URL=... OBSIDIAN_VAULT_PATH=/path/to/vault \
  npm run vault:restore:dry    # PREVIEW primero
DATABASE_URL=... OBSIDIAN_VAULT_PATH=/path/to/vault \
  npm run vault:restore        # REAL — pide confirmación

# 6. Verificar integridad
npm run vault:integrity
```

**Verificación**:
```bash
# Login en FINORA → confirmar que las cuentas / movimientos están
curl -H "Cookie: authjs.session-token=..." http://localhost:3000/api/transactions | jq '.data | length'
```

**Tiempo estimado**: 15–30 minutos.

---

## Escenario 3: Vault se borra pero DB funciona

**Síntomas**: directorio `FINORA/` del Vault perdido o corrupto.
Postgres intacto.

**Recuperación**:

```bash
# 1. Verificar que DB tiene datos
DATABASE_URL=... npx prisma studio  # abrir UI y revisar

# 2. Regenerar Vault completo
DATABASE_URL=... OBSIDIAN_VAULT_PATH=/path/to/vault \
  npm run vault:rebuild

# 3. Verificar
npm run vault:integrity
```

**Verificación**: abrir el Vault en Obsidian y revisar que los archivos están ahí.

**Tiempo estimado**: 1–5 minutos.

---

## Escenario 4: Servidor completo muere

**Síntomas**: hardware roto, robo, disco muerto.

**Recuperación** (asumiendo que tenés backups fuera del servidor):

```bash
# 1. En nueva máquina: instalar Postgres + Node.js
# 2. Restaurar el último backup de Postgres
pg_restore --dbname=postgresql://finora_app:...@localhost/finora \
  --clean --if-exists /backups/finora_xxxx.dump

# 3. Clonar código FINORA
git clone <repo>
cd finora && npm ci

# 4. Configurar .env
# (usar el AUTH_SECRET previo o generar uno nuevo y re-hashear passwords)

# 5. Regenerar Vault desde DB
DATABASE_URL=... OBSIDIAN_VAULT_PATH=/path/to/vault \
  npm run vault:rebuild

# 6. Verificar que el Vault (que vive fuera del servidor) está intacto
# 7. Configurar Cloudflare Tunnel otra vez (si usás nueva máquina)
```

**Tiempo estimado**: 1–4 horas (depende de si tenés backups listos).

---

## Escenario 5: Cloudflare Tunnel falla

**Síntomas**: la URL remota `finora.tudominio.com` no responde, pero `localhost:3000` sí.

**Impacto**: solo pierdes acceso remoto. La app y DB siguen funcionando.

**Recuperación**:

```bash
# 1. Diagnóstico del tunnel
cloudflared tunnel info finora-server
journalctl -u cloudflared -f      # Linux
# ó: Get-EventLog -LogName Application -Source cloudflared   # Windows

# 2. Si cloudflared crasheó: reiniciar
sudo systemctl restart cloudflared   # Linux
nssm restart Cloudflared             # Windows

# 3. Mientras tanto: usar IP local del servidor
#    desde LAN (ej: http://192.168.1.100:3000)
```

---

## Escenario 6: Internet del servidor cae

**Síntomas**: el servidor no tiene conexión a Internet.

**Impacto**: solo pierdes acceso remoto vía Tunnel. Todo lo demás sigue.

**Recuperación**:
- Postgres local sigue aceptando queries
- Vault sigue escribiéndose si el worker está corriendo
- Cuando vuelva Internet, cloudflared reconectará automáticamente

No requiere acción.

---

## Procedimiento de Disaster Recovery Test

**Periodicidad recomendada**: trimestral.

```bash
# 1. Crear DB temporal VACÍA
sudo -u postgres psql -c "CREATE DATABASE finora_drill WITH OWNER finora_app;"
DATABASE_URL="postgresql://finora_app:...@localhost/finora_drill" \
  npx prisma migrate deploy

# 2. Ejecutar restore
DATABASE_URL="..." OBSIDIAN_VAULT_PATH=... \
  npm run vault:restore

# 3. Comparar entity counts con DB original
DATABASE_URL_ORIGINAL=... npm run vault:integrity
DATABASE_URL_DRILL=... npm run vault:integrity
# Los counts deben coincidir exactamente.

# 4. Verificar totales financieros
# Sumar balances de accounts, holdings de investments, etc.
# Comparar con la DB original.

# 5. Limpiar
sudo -u postgres psql -c "DROP DATABASE finora_drill;"
```

---

## Política de backups (resumen)

| Tipo | Frecuencia | Ubicación | Retención |
|---|---|---|---|
| **pg_dump** (Postgres) | diario | servidor local + opcional cifrado en Vault | 7d + 4sem + 6mes |
| **Vault Obsidian** | continuo (via outbox) | filesystem local | permanente |
| **Código FINORA** | por commit | git remote | permanente |
| **.env y secrets** | manual | 1Password / Bitwarden | permanente |

---

## Lo que NO se puede recuperar sin backups

Si perdés simultáneamente:
- DB Postgres
- Vault Obsidian
- Código fuente

→ **No hay recovery**.

Por eso el Vault y los pg_dump deben estar en **discos distintos** o
**sincronizarse a cloud cifrado**.

---

## Runbook rápido

```bash
# ¿Qué tenemos?
ls -la /opt/finora/
ls -la /path/to/vault/FINORA/

# ¿Postgres corre?
sudo systemctl status postgresql
pg_isready -h 127.0.0.1

# ¿Vault existe?
test -d "/path/to/vault/FINORA" && echo "OK"

# ¿FINORA corre?
curl http://localhost:3000/api/health

# ¿Tunnel conectado?
cloudflared tunnel info finora-server

# Rebuild completo desde DB
DATABASE_URL=... OBSIDIAN_VAULT_PATH=... npm run vault:rebuild

# Restore desde Vault (DB debe estar vacía o ser DB de prueba)
DATABASE_URL=... OBSIDIAN_VAULT_PATH=... npm run vault:restore:dry
DATABASE_URL=... OBSIDIAN_VAULT_PATH=... npm run vault:restore
```