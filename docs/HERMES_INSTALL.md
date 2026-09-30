# FINORA — HERMES_INSTALL.md

> **Documento de instalación para otro agente (Hermes) en una PC limpia.**

Este documento describe paso a paso cómo desplegar FINORA en una PC vieja
que funcionará como servidor personal 24/7. No requiere conocimientos de Next.js
ni de la arquitectura interna: seguir los pasos en orden.

**Tiempo estimado total**: 1–2 horas (incluyendo compilación + verificaciones).

---

## 0. Resumen ejecutivo

FINORA corre como **3 procesos locales**:

1. **PostgreSQL 16** (puerto 5432, listening en `127.0.0.1` SOLAMENTE)
2. **FINORA Next.js** (puerto 3000, listening en `127.0.0.1`)
3. **FINORA Sync Worker** (no port, proceso Node)

Exposición externa: **Cloudflare Tunnel** (cloudflared) →
`https://finora.tudominio.com`

El Vault de Obsidian vive en `${OBSIDIAN_VAULT_PATH}/FINORA/`.

---

## 1. Requisitos del servidor

| | Mínimo | Recomendado |
|---|---|---|
| OS | Windows 10/11, Debian 11+, Ubuntu 22.04+ | Linux LTS |
| CPU | 2 cores | 4 cores |
| RAM | 2 GB | 4 GB+ |
| Disco | 20 GB | 100 GB SSD |
| Red | Ethernet | Ethernet (Wi-Fi funciona pero requiere IP fija en LAN) |

### Comandos por OS

```bash
# Debian/Ubuntu
sudo apt update && sudo apt upgrade -y

# Verificar versiones instaladas (o instalar):
node --version        # debe ser >= 20
psql --version         # debe ser >= 14 (recomendado 16)
git --version          # >= 2
cloudflared --version # cualquier versión reciente
```

Si algo falta, instalar:

```bash
# Node 20+ (NodeSource):
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL 16:
sudo apt install -y postgresql-16 postgresql-client-16

# cloudflared (Cloudflare Tunnel client):
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install -y cloudflared

# Build essentials (para compilar Prisma engines):
sudo apt install -y build-essential python3 openssl ca-certificates
```

---

## 2. PostgreSQL local

### Crear usuario y DB para FINORA

```bash
sudo -u postgres psql

# Dentro de psql:
CREATE USER finora_app WITH PASSWORD 'GENERAR_PASSWORD_FUERTE_24_CHARS_MIN';
CREATE DATABASE finora OWNER finora_app;
GRANT ALL PRIVILEGES ON DATABASE finora TO finora_app;
\q
```

**Anotar**: el password va en `DATABASE_URL`. Usá un password FUERTE (24+ chars).

### Restringir PostgreSQL a localhost

Editar `/etc/postgresql/16/main/pg_hba.conf`:

```
# Conexión local vía socket/loopback
host    finora    finora_app    127.0.0.1/32    scram-sha-256
host    finora    finora_app    ::1/128          scram-sha-256
```

Y `/etc/postgresql/16/main/postgresql.conf`:

```
listen_addresses = '127.0.0.1'        # NUNCA '*' ni '0.0.0.0'
port = 5432
```

Reiniciar:

```bash
sudo systemctl reload postgresql
# Verificar:
ss -ltn | grep 5432
# Debe mostrar 127.0.0.1:5432 SOLAMENTE
```

### Test

```bash
PGPASSWORD="GENERAR_PASSWORD_FUERTE" psql -h 127.0.0.1 -U finora_app -d finora -c "SELECT version();"
```

---

## 3. Cloudflare Tunnel (acceso remoto)

### 3.1 Crear tunnel en Cloudflare

1. Login en https://dash.cloudflare.com/
2. **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel**
3. Tipo: **Cloudflared**
4. Nombre: `finora-server` (o el que prefieras)
5. Copiar el **Tunnel Token** (largo string base64)
6. En **Public Hostname**, agregar:
   - Subdomain: `finora`
   - Domain: `tudominio.com`
   - Service: `http://localhost:3000`

### 3.2 Instalar cloudflared (ya hecho en paso 1) y configurar

```bash
sudo mkdir -p /etc/cloudflared
sudo nano /etc/cloudflared/config.yml
```

Contenido:

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /etc/cloudflared/<TUNNEL_ID>.json
ingress:
  - hostname: finora.tudominio.com
    service: http://localhost:3000
  - service: http_status:404
```

```bash
# Pegar las credenciales (de la UI de Cloudflare) en:
sudo nano /etc/cloudflared/<TUNNEL_ID>.json

# Crear servicio systemd:
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared

# Verificar:
sudo cloudflared tunnel info finora-server
```

### 3.3 (Opcional) Cloudflare Access

Para agregar una capa adicional de auth:

1. **Zero Trust** → **Access** → **Applications** → **Add**
2. Tipo: **Self-hosted**
3. Application name: FINORA
4. Domain: `finora.tudominio.com`
5. Session duration: 24h
6. Policies → **Allow**:
   - **Include → Emails**: `tu@email.com`
   - **Require** → One-Time PIN (opcional)

---

## 4. Instalar FINORA

### 4.1 Clonar y preparar

```bash
# Elegir directorio (ej: /opt/finora o C:\FINORA)
sudo mkdir -p /opt/finora
sudo chown $USER:$USER /opt/finora
cd /opt/finora

# Clonar repo (ajustar URL)
git clone <repo-url> .
# o, si se pasa un tarball:
tar xzf finora.tar.gz -C /opt/finora --strip-components=1
```

### 4.2 Instalar dependencias

```bash
npm ci --omit=dev     # producción
# o, si necesitás tsx para los scripts de mantenimiento:
npm ci
```

### 4.3 Configurar `.env`

```bash
cp .env.example .env
nano .env   # o vim, code, etc.
```

Valores a completar:

```bash
# === Requeridos ===
DATABASE_URL="postgresql://finora_app:TU_PASSWORD@127.0.0.1:5432/finora?schema=public"
AUTH_SECRET="$(openssl rand -base64 48)"   # generar primero

# === Recomendados ===
AUTH_URL="https://finora.tudominio.com"
NODE_ENV="production"
TZ="America/Argentina/Buenos_Aires"
NEXT_PUBLIC_BASE_CURRENCY="ARS"
OBSIDIAN_VAULT_PATH="/path/to/ObsidianVault"   # ej: /home/user/Documents/MiVault

# === Backups ===
FINORA_BACKUP_PATH="/var/backups/finora"   # separado del Vault idealmente

# === Bootstrap (TEMPORAL) ===
FINORA_BOOTSTRAP_ENABLED="true"
FINORA_BOOTSTRAP_EMAIL="tu@email.com"
FINORA_BOOTSTRAP_PASSWORD="TuPasswordFuerte!2024Min12"

# === Opcionales (defaults razonables) ===
PG_DUMP_PATH="/usr/bin/pg_dump"
PG_RESTORE_PATH="/usr/bin/pg_restore"
```

### 4.4 Aplicar migraciones

```bash
npx prisma generate
npx prisma migrate deploy
```

### 4.5 Crear el primer usuario

```bash
# Opción A: HTTP (desde la misma PC o cualquiera con acceso a localhost)
curl -X POST http://localhost:3000/api/bootstrap

# Opción B: CLI interactivo
npm run db:init-prod
# (pedirá email y password, valida complejidad)
```

**Verificar que el usuario se creó**:

```bash
PGPASSWORD="..." psql -h 127.0.0.1 -U finora_app -d finora -c "SELECT email, name FROM \"User\";"
```

### 4.6 DESACTIVAR bootstrap

Una vez creado el primer usuario:

```bash
nano .env
# Cambiar: FINORA_BOOTSTRAP_ENABLED="true"  →  FINORA_BOOTSTRAP_ENABLED="false"
```

### 4.7 Build

```bash
npm run build
```

Esto toma ~30s. Output en `.next/`.

### 4.8 Verificación de health

```bash
# Iniciar FINORA (en background para test):
nohup npx next start -p 3000 > /tmp/finora.log 2>&1 &
echo "PID=$!"
sleep 5

curl http://localhost:3000/api/health
# Esperado: {"status":"ok","db":"ok","timestamp":"..."}
```

---

## 5. Auto-start de procesos

### Linux (systemd)

#### 5.1 FINORA Next.js

`/etc/systemd/system/finora.service`:

```ini
[Unit]
Description=FINORA Next.js
After=network.target postgresql.service

[Service]
Type=simple
User=finora
WorkingDirectory=/opt/finora
EnvironmentFile=/opt/finora/.env
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start -p 3000 -H 127.0.0.1
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

#### 5.2 Sync Worker

`/etc/systemd/system/finora-sync.service`:

```ini
[Unit]
Description=FINORA Obsidian Sync Worker
After=network.target

[Service]
Type=simple
User=finora
WorkingDirectory=/opt/finora
EnvironmentFile=/opt/finora/.env
ExecStart=/usr/bin/npx tsx scripts/sync-worker.ts
Restart=always
RestartSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

#### 5.3 Backup automático diario (opcional)

`/etc/systemd/system/finora-backup.timer`:

```ini
[Unit]
Description=FINORA pg_dump daily
Requires=finora-backup.service

[Timer]
OnCalendar=daily
OnCalendar=03:00
Persistent=true

[Install]
WantedBy=timers.target
```

`/etc/systemd/system/finora-backup.service`:

```ini
[Unit]
Description=FINORA pg_dump daily

[Service]
Type=oneshot
User=finora
WorkingDirectory=/opt/finora
EnvironmentFile=/opt/finora/.env
ExecStart=/usr/bin/npx tsx scripts/backup-pg.ts
```

#### 5.4 Activar

```bash
sudo systemctl daemon-reload
sudo systemctl enable finora.service
sudo systemctl enable finora-sync.service
sudo systemctl enable finora-backup.timer
sudo systemctl start finora
sudo systemctl start finora-sync
sudo systemctl start finora-backup.timer

sudo systemctl status finora
sudo systemctl status finora-sync
sudo systemctl status finora-backup.timer
```

### Windows (NSSM — Non-Sucking Service Manager)

Descargar NSSM desde https://nssm.cc/.

```powershell
# FINORA Next.js
nssm install FINORA "C:\Program Files\nodejs\node.exe" "C:\FINORA\node_modules\next\dist\bin\next start -p 3000 -H 127.0.0.1"
nssm set FINORA AppDirectory "C:\FINORA"
nssm set FINORA AppEnvironmentExtra "NODE_ENV=production"
nssm set FINORA DisplayName "FINORA Next.js"
nssm set FINORA Start SERVICE_AUTO_START
nssm set FINORA AppStdout "C:\FINORA\logs\finora.log"
nssm set FINORA AppStderr "C:\FINORA\logs\finora-error.log"
nssm set FINORA AppRotateFiles 1
nssm set FINORA AppRotateBytes 10485760

# FINORA Sync Worker
nssm install FINORA-Sync "C:\Program Files\nodejs\node.exe" "C:\FINORA\node_modules\.bin\tsx.cmd scripts\sync-worker.ts"
nssm set FINORA-Sync AppDirectory "C:\FINORA"
nssm set FINORA-Sync AppEnvironmentExtra "OBSIDIAN_VAULT_PATH=C:\Users\..."
nssm set FINORA-Sync Start SERVICE_AUTO_START

# cloudflared
nssm install Cloudflared "C:\Program Files\cloudflared\cloudflared.exe" "tunnel run"
nssm set Cloudflared AppDirectory "C:\Users\USUARIO\.cloudflared"
nssm set Cloudflared Start SERVICE_AUTO_START

# PostgreSQL ya corre como servicio del instalador

# Activar
nssm start FINORA
nssm start FINORA-Sync
nssm start Cloudflared
```

---

## 6. Power management (importante para 24/7)

### 6.1 Desactivar sleep/hibernación

```bash
# Linux (systemd):
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target

# Verificar:
systemctl status sleep.target
# Estado esperado: "Loaded: loaded (...) masked"
```

### 6.2 BIOS — auto-restart después de corte de luz

Reiniciar la PC → entrar a BIOS → buscar opciones:
- "Restore on AC Power Loss" → "Power On"
- "After Power Failure" → "Power On"
- "AC Power Recovery" → "On"

(El nombre exacto varía según fabricante.)

### 6.3 Si es notebook: tapa cerrada

```bash
# Linux (logind.conf):
sudo nano /etc/systemd/logind.conf
# HandleLidSwitch=ignore
sudo systemctl restart systemd-logind
```

### 6.4 Ethernet preferido

Si la PC tiene Ethernet y Wi-Fi, configurar para usar Ethernet por default
(menor latencia, mayor estabilidad). El comando exacto depende del OS.

---

## 7. Verificación final

### 7.1 Servicios corriendo

```bash
sudo systemctl status postgresql finora finora-sync finora-backup.timer cloudflared
# Todos deben estar "active (running)"
```

### 7.2 Health checks

```bash
# App local:
curl http://localhost:3000/api/health
# Esperado: {"status":"ok","db":"ok",...}

# App remota (vía Cloudflare Tunnel):
curl https://finora.tudominio.com/api/health
# Esperado: igual que arriba

# Sistema (autenticado):
# Ir a https://finora.tudominio.com/sistema (después de login)
# Verificar:
#  - PostgreSQL: Connected
#  - Obsidian: Connected
#  - Sync: Pending=0, Failed=0
#  - Disk: <80%
```

### 7.3 Test de Vault

```bash
# Crear un gasto de prueba:
# Login en https://finora.tudominio.com/login
# Quick Add → crear gasto "$100 test"
# Esperar 5 segundos
# Verificar que el archivo aparece en:
ls -la "$OBSIDIAN_VAULT_PATH/FINORA/01 Transactions/$(date +%Y)/$(date +%m)/"
# Debe haber un archivo .md con checksum sha256:...
```

### 7.4 Test de backup

```bash
# Manual:
npm run backup:pg
ls -la "$FINORA_BACKUP_PATH"/

# Verificar el último:
npm run backup:verify
# Esperado: "✓ Todos los backups OK."
```

### 7.5 Test de reboot

```bash
sudo reboot
# Esperar 2 minutos
# Después:
sudo systemctl status postgresql finora finora-sync cloudflared
# Todos deben haber arrancado automáticamente
curl https://finora.tudominio.com/api/health
```

Si esto falla, los servicios no están configurados como `enabled` o no están
en `WantedBy=multi-user.target`.

---

## 8. Comandos útiles del día a día

```bash
# Ver logs:
sudo journalctl -u finora -f
sudo journalctl -u finora-sync -f

# Reiniciar servicios:
sudo systemctl restart finora
sudo systemctl restart finora-sync

# Estado del sync:
curl http://localhost:3000/api/sync/run -X POST  # forzar procesamiento

# Backup manual:
npm run backup:pg

# Verificar backup:
npm run backup:verify

# Rebuild Vault desde DB (regenera todo):
npm run vault:rebuild

# Verificar integridad DB ↔ Vault:
npm run vault:integrity

# Restaurar DB desde Vault (DESTRUCTIVO — con confirmación):
npm run vault:restore:dry   # preview
npm run vault:restore        # REAL

# Generar reportes agregados (Dashboard + Monthly):
npm run obsidian:reports

# Import controlado desde Vault → FINORA:
npm run obsidian:import         # dry-run
npm run obsidian:import -- --yes  # aplica
```

---

## 9. Tests de aceptación (Hermes debe verificar)

```bash
# 1. Health endpoint OK:
curl http://localhost:3000/api/health  # status:ok, db:ok

# 2. Auth funciona:
curl -X POST http://localhost:3000/api/auth/signin  # sin credenciales → 401

# 3. PostgreSQL NO está expuesto:
ss -ltn | grep 5432   # sólo 127.0.0.1:5432

# 4. Vault mirror funciona:
# Crear un gasto en la app → verificar que aparece en $OBSIDIAN_VAULT_PATH/FINORA/

# 5. Backup funciona:
npm run backup:pg && npm run backup:verify

# 6. Restore dry-run funciona:
npm run vault:restore:dry   # debe mostrar counts y warnings

# 7. Reboot recovery:
sudo reboot   # esperar, después:
curl http://localhost:3000/api/health  # debe responder
```

---

## 10. Checklist final

- [ ] PostgreSQL instalado, escuchando en 127.0.0.1
- [ ] DB `finora` creada, user `finora_app` con permisos
- [ ] pg_hba.conf configurado (sólo localhost para finora_app)
- [ ] postgresql.conf configurado (listen_addresses = '127.0.0.1')
- [ ] Node.js 20+ instalado
- [ ] Repo FINORA clonado en /opt/finora
- [ ] `npm ci` ejecutado
- [ ] `.env` configurado con AUTH_SECRET generado, DATABASE_URL, OBSIDIAN_VAULT_PATH, FINORA_BACKUP_PATH, TZ
- [ ] `prisma migrate deploy` aplicado
- [ ] Primer usuario creado via /api/bootstrap o db:init-prod
- [ ] FINORA_BOOTSTRAP_ENABLED=false
- [ ] `npm run build` exitoso
- [ ] Health endpoint responde OK
- [ ] cloudflared instalado y corriendo
- [ ] Cloudflare Tunnel configurado y activo
- [ ] Cloudflare Access (opcional) configurado
- [ ] Servicios en systemd/NSSM, configurados para auto-start
- [ ] Sleep/hibernación desactivados
- [ ] BIOS auto-restart configurado
- [ ] Backup pg_dump programado y verificado
- [ ] Vault existe y FINORA/ dentro
- [ ] Reboot test passed
- [ ] Login desde iPhone usando 4G (no misma Wi-Fi) funciona

---

## 11. Documentación adicional

- `docs/DEPLOYMENT-SELFHOSTED.md` — guía detallada (alternativa a este doc)
- `docs/SECURITY.md` — threat model completo
- `docs/OBSIDIAN-SYNC.md` — arquitectura del sync engine
- `docs/DISASTER_RECOVERY.md` — escenarios de recovery
- `docs/HERMES_INSTALL.md` — ESTE DOCUMENTO

---

## 12. Si algo falla

### Health endpoint muestra db:error

```bash
sudo systemctl status postgresql
sudo journalctl -u postgresql -e
# Verificar pg_hba.conf y .env
```

### Tunnel no conecta

```bash
sudo cloudflared tunnel info finora-server
sudo journalctl -u cloudflared -e
# Verificar TUNNEL_ID y credenciales en /etc/cloudflared/
```

### Vault no se actualiza

```bash
sudo systemctl status finora-sync
sudo journalctl -u finora-sync -e
ls -la "$OBSIDIAN_VAULT_PATH/FINORA/"
# Verificar permisos del usuario `finora` sobre el Vault
```

### Login no funciona

```bash
# Verificar:
PGPASSWORD="..." psql -h 127.0.0.1 -U finora_app -d finora -c "SELECT email FROM \"User\";"
# Si retorna tu email, el usuario existe.
# Si no, hay que correr db:init-prod o revisar el bootstrap.
```

### Reinstalar TODO

```bash
# CUIDADO: esto BORRA la DB
sudo systemctl stop finora finora-sync
sudo -u postgres dropdb finora
sudo -u postgres psql -c "CREATE DATABASE finora OWNER finora_app;"
sudo systemctl start finora
# Repetir paso 4.4-4.7
```

---

**FINORA instalado correctamente. El servidor está listo para uso personal 24/7
desde cualquier dispositivo del mundo vía HTTPS.**