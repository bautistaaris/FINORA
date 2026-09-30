# FINORA — Self-Hosted Deployment Guide

FINORA corre en una PC vieja que actúa como infraestructura local permanente.
El acceso remoto se hace vía **Cloudflare Tunnel** (sin port forwarding, sin
abrir puertos del router).

```
```
Internet
   │
   │ HTTPS
   ↓
Cloudflare DNS + Tunnel (cloudflared en la PC)
   │
   ↓
https://finora.tudominio.com → localhost:3000
   │
   ↓
Cloudflare Access (opcional, 2da capa de auth)
   ↓
FINORA Next.js (puerto 3000 local)
   │
   ↓
PostgreSQL local (puerto 5432, NO expuesto)
   │
   ↓
Obsidian Vault (filesystem local)
```

---

## 1. Requisitos del servidor

| | Mínimo | Recomendado |
|---|---|---|
| SO | Windows 10/11 o Linux | Linux (Debian/Ubuntu LTS) |
| RAM | 2 GB | 4 GB+ |
| Disco | 20 GB | 100 GB SSD (para backups + Vault) |
| Red | Ethernet | Ethernet (Wi-Fi funciona pero requiere IP fija en LAN) |

**Power management**:
- Desactivar sleep, hibernación
- Si es notebook: configurar "no apagar al cerrar tapa"
- UPS recomendado para cortes de luz
- Auto-restart en BIOS después de corte

---

## 2. Instalar PostgreSQL local

### Linux (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install postgresql-16 postgresql-contrib

# Crear DB y usuario para FINORA
sudo -u postgres psql
postgres=# CREATE USER finora_app WITH PASSWORD 'GENERAR_PASSWORD_FUERTE';
postgres=# CREATE DATABASE finora OWNER finora_app;
postgres=# GRANT ALL PRIVILEGES ON DATABASE finora TO finora_app;
postgres=# \q

# Habilitar conexión local vía socket (no TCP)
echo "host    finora    finora_app    127.0.0.1/32    scram-sha-256" | sudo tee -a /etc/postgresql/16/main/pg_hba.conf
sudo systemctl reload postgresql
```

### Windows

1. Descargar PostgreSQL 16 desde https://www.postgresql.org/download/windows/
2. Instalar con password del usuario `postgres`
3. Abrir **pgAdmin** o **SQL Shell (psql)** y ejecutar:

```sql
CREATE USER finora_app WITH PASSWORD 'GENERAR_PASSWORD_FUERTE';
CREATE DATABASE finora OWNER finora_app;
GRANT ALL PRIVILEGES ON DATABASE finora TO finora_app;
```

4. Editar `pg_hba.conf` (en `C:\Program Files\PostgreSQL\16\data\`):
```
# Permitir conexiones locales TCP a finora DB con password
host    finora    finora_app    127.0.0.1/32    scram-sha-256
host    finora    finora_app    ::1/128          scram-sha-256
```

5. Reiniciar el servicio PostgreSQL.

**IMPORTANTE**: PostgreSQL NO debe escuchar en interfaces públicas.
Verificar en `postgresql.conf`:
```
listen_addresses = '127.0.0.1'        # SOLO localhost
# listen_addresses = '*'             # MAL — no usar
```

---

## 3. Instalar FINORA

### Clonar repo e instalar

```bash
# (elegir directorio, ej: C:\FINORA o /opt/finora)
cd C:\FINORA  # o cd /opt/finora

git clone <repo-url> .
npm ci --omit=dev   # prod; o npm ci para tener dev también

# Generar AUTH_SECRET fuerte
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

### Configurar .env

`.env` (NUNCA commitear):

```bash
DATABASE_URL="postgresql://finora_app:PASSWORD_FUERTE@127.0.0.1:5432/finora?schema=public"
AUTH_SECRET="<pegar el resultado del comando anterior>"
AUTH_URL="http://localhost:3000"   # prod: https://finora.tudominio.com
NODE_ENV="production"
OBSIDIAN_VAULT_PATH="C:/Users/TuUsuario/Documents/ObsidianVault"   # o ruta Linux

# Bootstrap — leer abajo
FINORA_BOOTSTRAP_ENABLED="true"
FINORA_BOOTSTRAP_EMAIL="tu@email.com"
FINORA_BOOTSTRAP_PASSWORD="ContraseñaFuerte!2024"
```

### Aplicar migraciones y crear primer usuario

```bash
# Generar cliente Prisma + aplicar schema
npx prisma generate
npx prisma migrate deploy

# Bootstrap (una sola vez)
curl -X POST http://localhost:3000/api/bootstrap
# ó:
DATABASE_URL=... FINORA_BOOTSTRAP_ENABLED=true \
  FINORA_BOOTSTRAP_EMAIL="tu@email.com" \
  FINORA_BOOTSTRAP_PASSWORD="TuPassFuerte!2024" \
  npm run db:init-prod

# DESACTIVAR bootstrap inmediatamente
# Editar .env: FINORA_BOOTSTRAP_ENABLED="false"
```

---

## 4. Auto-start (Windows Service)

### Opción A: NSSM (recomendado)

Descargar NSSM desde https://nssm.cc/.

```powershell
# Crear servicio para FINORA
nssm install FINORA "C:\Program Files\nodejs\node.exe" "C:\FINORA\server.js"

# O usar el script server.js incluido:
# (construirlo si no existe — ver sección 7)
nssm set FINORA AppDirectory "C:\FINORA"
nssm set FINORA AppEnvironmentExtra "NODE_ENV=production^DATABASE_URL=..."
nssm set FINORA DisplayName "FINORA Next.js"
nssm set FINORA Description "FINORA personal finance app"
nssm set FINORA Start SERVICE_AUTO_START
nssm set FINORA AppStdout "C:\FINORA\logs\finora.log"
nssm set FINORA AppStderr "C:\FINORA\logs\finora-error.log"
nssm set FINORA AppRotateFiles 1
nssm set FINORA AppRotateBytes 10485760

# Crear servicio para Sync Worker
nssm install FINORA-Sync "C:\Program Files\nodejs\node.exe" "C:\FINORA\scripts\sync-worker-runner.js"
nssm set FINORA-Sync AppDirectory "C:\FINORA"
nssm set FINORA-Sync AppEnvironmentExtra "OBSIDIAN_VAULT_PATH=C:\Users\..."
# ... similar

nssm start FINORA
nssm start FINORA-Sync
```

### Opción B: Task Scheduler

```powershell
# Trigger: At system startup
# Action: Start a program
# Program: C:\Program Files\nodejs\node.exe
# Arguments: C:\FINORA\server.js
# Working directory: C:\FINORA
# Run with highest privileges
```

---

## 5. Auto-start (Linux systemd)

`/etc/systemd/system/finora.service`:

```ini
[Unit]
Description=FINORA Personal Finance
After=network.target postgresql.service

[Service]
Type=simple
User=finora
WorkingDirectory=/opt/finora
EnvironmentFile=/opt/finora/.env
ExecStart=/usr/bin/node /opt/finora/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/finora-sync.service`:

```ini
[Unit]
Description=FINORA Sync Worker
After=network.target

[Service]
Type=simple
User=finora
WorkingDirectory=/opt/finora
EnvironmentFile=/opt/finora/.env
ExecStart=/usr/bin/npx tsx /opt/finora/scripts/sync-worker.ts
Restart=always
RestartSec=30

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable finora.service
sudo systemctl enable finora-sync.service
sudo systemctl start finora
sudo systemctl start finora-sync
sudo systemctl status finora
```

---

## 6. Cloudflare Tunnel

### 6.1 Crear cuenta y tunnel

1. Crear cuenta en https://dash.cloudflare.com/
2. **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel**
3. Tipo: **Cloudflared**
4. Nombre: `finora-server`
5. En la sección **Install & run**:
   - Copiar el comando (similar a `cloudflared service install <TOKEN>`)
   - Pegar el token en `.env` del servidor como `TUNNEL_TOKEN=...`

### 6.2 Configurar tunnel

`/etc/cloudflared/config.yml` (Linux) o `C:\Users\X\.cloudflared\config.yml`:

```yaml
tunnel: finora-server
credentials-file: /etc/cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: finora.tudominio.com
    service: http://localhost:3000
  - service: http_status:404
```

### 6.3 DNS

En Cloudflare DNS, agregar:
- Tipo: `CNAME`
- Nombre: `finora`
- Destino: `<TUNNEL_ID>.cfargotunnel.com`
- Proxy: **Proxied** (naranja)

### 6.4 Correr cloudflared como servicio

**Linux** (systemd):

```bash
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

**Windows**:

```powershell
cloudflared service install
# O manualmente con NSSM:
nssm install Cloudflared "C:\Program Files\cloudflared\cloudflared.exe" "tunnel run"
nssm set Cloudflared AppDirectory "C:\Users\X\.cloudflared"
nssm set Cloudflared Start SERVICE_AUTO_START
nssm start Cloudflared
```

Verificar:
```bash
cloudflared tunnel info finora-server
```

---

## 7. server.js wrapper

Crear `server.js` en la raíz del proyecto:

```javascript
// FINORA — Server wrapper
// Corre next en producción como proceso Node normal.
// Permite usar NSSM / systemd sin npm.cmd intermediario.

const { spawn } = require("node:child_process");
const path = require("node:path");

const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
const args = ["next", "start", "-p", process.env.PORT || "3000"];

const child = spawn(cmd, args, {
  stdio: "inherit",
  cwd: __dirname,
  env: process.env,
});

child.on("exit", (code) => {
  console.log(`next exited with code ${code}`);
  process.exit(code ?? 0);
});

process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
```

---

## 8. Cloudflare Access (capa opcional)

**Cloudflare Zero Trust → Access → Applications → Add**:

- **Name**: FINORA
- **Domain**: `finora.tudominio.com`
- **Session duration**: 24h (o según necesidad)
- **Policies**:
  - **Name**: Solo yo
  - **Action**: Allow
  - **Include**:
    - **Emails**: `tu@email.com`
  - **Require** (opcional): One-Time PIN

Cuando el usuario visita `finora.tudominio.com`:
1. Cloudflare valida email + OTP (si está configurado)
2. Si pasa, el request sigue al tunnel
3. FINORA muestra su propio login (doble auth)

---

## 9. PWA en iPhone

```
1. Abrir Safari → https://finora.tudominio.com
2. Login con credenciales
3. Compartir → Añadir a pantalla de inicio
5. Confirmar nombre "FINORA" → Agregar
```

Funciona desde:
- Wi-Fi de casa
- 4G/5G del operador
- Wi-Fi del trabajo / universidad
- Wi-Fi de hotel / café
- Roaming internacional

---

## 10. Estructura final en disco (ejemplo Windows)

```
C:\FINORA\
├── .env
├── package.json
├── server.js
├── next.config.mjs
├── prisma\
├── public\
├── scripts\
│   ├── sync-worker.ts
│   ├── vault-rebuild.ts
│   ├── vault-restore.ts
│   ├── vault-integrity.ts
│   ├── backup-pg.ts
│   └── restore-pg.ts
├── src\

D:\MiVault\
└FINO\                  ← todo FINORA vive acá, aislado
   ├── 00 Dashboard\
   ├── 01 Transactions\
   ├── 02 Accounts\
   ├── ...
   ├── 98 Backups\        ← (opcional) copia de pg_dump
   └── 99 System\
```

---

## 11. Verificación post-deploy

```bash
# 1. Local funciona
curl http://localhost:3000/api/health
# → {"status":"ok","db":"ok",...}

# 2. Tunnel funciona
curl https://finora.tudominio.com/api/health
# → {"status":"ok","db":"ok",...}

# 3. Sync worker procesa
npm run sync:once
# → processed=X failed=Y

# 4. Vault tiene archivos
ls "D:\MiVault\FINORA\01 Transactions\"

# 5. Verificar integridad
npm run vault:integrity
```

---

## 12. Troubleshooting

### Cloudflare Tunnel no conecta

```bash
cloudflared tunnel info finora-server
cloudflared tunnel --config /etc/cloudflared/config.yml run finora-server
# Ver logs: journalctl -u cloudflared -f
```

### PostgreSQL rechaza conexión

```bash
# Verificar que el puerto está abierto en localhost
netstat -ano | grep 5432    # Windows
ss -ltn | grep 5432          # Linux

# Verificar pg_hba.conf
cat /etc/postgresql/16/main/pg_hba.conf | grep finora
```

### Vault no sincroniza

```bash
# Verificar que el worker corre
curl http://localhost:3000/api/sync/run -X POST
# Revisar /sistema para diagnóstico
```

### Permisos de Vault (Linux)

```bash
chown -R finora:finora /path/to/vault
chmod 700 /path/to/vault
```