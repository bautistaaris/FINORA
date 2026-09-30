# FINORA — Obsidian Sync Architecture

FINORA replica toda la información financiera al Vault de Obsidian
utilizando un patrón de **Transactional Outbox**.

---

## Principios

1. **PostgreSQL es la fuente operacional**. Toda escritura pasa por la DB.
2. **Obsidian es un mirror human-readable + recovery source**. No es necesario para usar FINORA.
3. **Atomicidad**: cada mutación DB + evento outbox se hacen en la MISMA transacción Postgres.
4. **Idempotencia**: si el worker procesa el mismo evento dos veces, el resultado es el mismo (rewrite del archivo).
5. **Recuperación**: `npm run vault:restore` reconstruye la DB desde el Vault.

---

## Arquitectura

```
   ┌────────────┐
   │  Usuario   │
   └─────┬──────┘
         │ POST /api/transactions
         ↓
   ┌────────────┐
   │ Next.js   │
   └─────┬──────┘
         │ prisma.$transaction(async tx => {
         │   await tx.transaction.create(...)
         │   await tx.account.update(...)       ← balances
         │   await enqueueOutbox(tx, {...})       ← evento
         │ })
         ↓
   ┌─────────────────────────────┐
   │  PostgreSQL                 │
   │  ┌───────────┐ ┌──────────┐ │
   │  │Transaction│ │SyncEvent │ │
   │  └───────────┘ └──────────┘ │
   └──────┬──────────────────────┘
          │
          ↓ (eventualmente, asíncrono)
   ┌─────────────────┐
   │  Sync Worker    │  ← corre cada 5s por defecto
   └─────┬───────────┘
         │ SELECT * FROM "SyncEvent" WHERE status='PENDING' FOR UPDATE
         │
         ↓
   ┌─────────────────┐
   │  Handlers       │  ← construyen Markdown por entidad
   └─────┬───────────┘
         │
         ↓ atomicWrite(temp + rename)
   ┌─────────────────────────────┐
   │  Obsidian Vault              │
   │  FINORA/                     │
   │    00 Dashboard/             │
   │    01 Transactions/{YYYY}/{MM}/│
   │    02 Accounts/              │
   │    03 Investments/           │
   │    04 Subscriptions/         │
   │    05 Budgets/               │
   │    06 Debts/                 │
   │    07 Recurring/             │
   │    08 Net Worth/             │
   │    09 Reports/Monthly/       │
   │    98 Backups/  ← (opcional)│
   │    99 System/                │
   └─────────────────────────────┘
```

---

## Estructura del Vault

```
$OBSIDIAN_VAULT_PATH/
└── FINORA/
    ├── 00 Dashboard/
    │   └── (regenerable)
    ├── 01 Transactions/
    │   └── {YYYY}/
    │       └── {MM}/
    │           ├── 2026-09-30__supermercado__a1b2c3d4.md
    │           ├── 2026-10-01__cafe__e5f6g7h8.md
    │           └── ...
    ├── 02 Accounts/
    │   ├── banco-galicia__i9j0k1l2.md
    │   └── ...
    ├── 03 Investments/
    │   ├── bitcoin__m3n4o5p6.md
    │   └── _transactions/    ← InvestmentTransaction
    ├── 04 Subscriptions/
    │   └── netflix__q7r8s9t0.md
    ├── 05 Budgets/
    │   └── {YYYY-MM}/
    │       └── 2026-09__comida__u1v2w3x4.md
    ├── 06 Debts/
    │   └── prestamo-personal__y5z6a7b8.md
    ├── 07 Recurring/
    │   └── alquiler__c9d0e1f2.md
    ├── 08 Net Worth/
    │   └── 2026-09__networth__g3h4i5j6.md
    ├── 09 Reports/
    │   └── Monthly/
    │       └── 2026-09.md  ← (futuro)
    ├── 98 Backups/
    │   └── finora_2026-09-30T03-00-00.dump  ← (si pg_dump escribe acá)
    └── 99 System/
        ├── sync-manifest.json  ← metadata global
        └── Deleted/             ← tombstones de archivos eliminados
            └── {YYYY-MM-DD}/
                ├── {filename}.md     ← archivo original (preservado)
                └── {filename}.tombstone.md  ← metadata de la eliminación
```

---

## Formato de archivos

Cada archivo Markdown generado tiene:

```yaml
---
finora_id: "clxxxxxxxxxxxxxxxx"
entity_type: "transaction"
schema_version: 1
record_version: 4
type: "EXPENSE"
amount: 32400.0000
currency: "ARS"
date: "2026-09-30T18:30:00.000Z"
account_id: "cl..."
account: "Mercado Pago"
category_id: "cl..."
category: "Comida"
description: "Supermercado Coto"
notes: null
payment_method: null
created_at: "2026-09-30T18:30:00.000Z"
updated_at: "2026-09-30T19:00:00.000Z"
source: "FINORA"
checksum: "sha256:abc123..."
---

# Supermercado Coto

**Tipo:** Gasto
**Monto:** $32.400 ARS
**Categoría:** Comida
**Cuenta:** Mercado Pago
**Fecha:** 30/09/2026
```

**Reglas**:
- `finora_id`: UUID estable, NO se regenera aunque cambie el nombre
- `schema_version`: 1 (actual). Si cambia el formato, incrementamos.
- `record_version`: contador monotónico por entidad
- `checksum`: SHA-256 del body sin la línea checksum (para detección de cambios)
- Frontmatter **ordenado alfabéticamente** (estabilidad de diffs)

---

## Outbox Pattern

### Modelo `SyncEvent`

```
id           UUID
userId       UUID (multi-user ready)
entityType   "Transaction" | "Account" | ...
entityId     UUID de la entidad
operation    "CREATE" | "UPDATE" | "DELETE"
payload      JSON snapshot completo
recordVersion Integer
status       "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"
attempts     Integer (0..10)
lastError     String?
createdAt    Timestamp
processedAt  Timestamp?
```

### Flujo

1. API route ejecuta `prisma.$transaction(async tx => { ... })`
2. Dentro: mutación + `await enqueueOutbox(tx, {...})`
3. Si la transacción falla, el evento NO se crea
4. Si la transacción OK, el evento queda PENDING

### Worker

```typescript
// En bucle cada 5s
const events = await prisma.syncEvent.findMany({
  where: { status: 'PENDING' OR (status: 'FAILED' AND attempts < 10) },
  orderBy: { createdAt: 'asc' },
  take: 50,
});

for (const event of events) {
  // Lock optimista
  await prisma.syncEvent.update({
    where: { id: event.id, status: { in: ['PENDING', 'FAILED'] } },
    data: { status: 'PROCESSING' },
  });
  
  try {
    await processEvent(event);
    await prisma.syncEvent.update({
      where: { id: event.id },
      data: { status: 'COMPLETED', processedAt: new Date() },
    });
  } catch (err) {
    const newAttempts = event.attempts + 1;
    await prisma.syncEvent.update({
      where: { id: event.id },
      data: {
        status: 'FAILED',
        attempts: newAttempts,
        lastError: err.message.slice(0, 1000),
      },
    });
    // Backoff exponencial: 5s, 10s, 20s, 40s, ...
  }
}
```

### Garantías

- **Atomicidad**: el evento y la mutación se hacen en la misma transacción DB
- **No pérdida**: si el worker falla, el evento queda para reintento
- **No duplicados en Vault**: el worker usa lock optimista + rewrite idempotente
- **Backoff exponencial**: hasta 10 intentos (≈4 horas de espera total)
- **Recuperación**: tras 10 fallos, requiere intervención manual (`vault:rebuild`)

---

## Atomic File Writes

Cada escritura en Vault es **atómica**:

```typescript
// 1. Escribir a archivo temporal
await fs.writeFile(`${targetPath}.tmp.${pid}.${Date.now()}`, content);

// 2. fsync (flush a disco)
await fd.sync();

// 3. Rename atómico (POSIX y NTFS)
await fs.rename(tmpPath, targetPath);
```

Esto evita archivos parcialmente escritos, importante si el Vault se sincroniza
vía Google Drive / OneDrive / Dropbox (que pueden leer archivos a medio escribir).

---

## Checksums

Cada archivo lleva SHA-256 del body en el frontmatter:

```yaml
checksum: "sha256:abc123..."
```

Para verificar integridad (drill):

```bash
# Re-leer cada archivo, recalcular SHA-256 del body, comparar
# con el campo checksum del frontmatter
```

Esto detecta:
- Corrupción de disco
- Cambios manuales no autorizados en el Vault
- Sincronización parcial

---

## Tombstones (deletions)

Cuando se elimina una entidad en FINORA:

1. Worker mueve el archivo original a `99 System/Deleted/{YYYY-MM-DD}/`
2. Worker crea un archivo `{name}.tombstone.md` con metadata:
   ```yaml
   finora_id: "..."
   entity_type: "transaction_tombstone"
   schema_version: 1
   record_version: 5
   deleted_at: "2026-09-30T..."
   reason: "deleted"
   ```
3. Restore-from-Vault IGNORA los tombstones
4. Limpieza manual después de 90 días (política a definir)

---

## Schema versioning

Si FINORA cambia el formato de los archivos:

1. Bump `FINORA_SCHEMA_VERSION` en `paths.ts`
2. Generar función `migrate_v1_to_v2(oldData) -> newData`
3. El worker aplica automáticamente al leer archivos con `schema_version: 1`
4. Reescribe con `schema_version: 2`

Los archivos con versiones mayores se preservan sin migración (decisión manual).

---

## Service Worker (PWA)

El service worker está **deliberadamente conservador**:

✅ Cachea:
- `/_next/static/*` (bundles JS/CSS)
- `/icons/*`
- `/manifest.json`
- Google Fonts CSS/woff2

❌ NO cachea:
- HTML de páginas autenticadas
- `/api/*` (datos financieros)
- `/sw.js`
- `/login`, `/home`, `/movimientos`, etc.

En modo offline, el SW sirve `/offline` (página estática) o 503 para APIs.

**Logout limpia la sesión pero el SW mantiene los assets** (no hay caché sensible).

---

## Configuración

### Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `OBSIDIAN_VAULT_PATH` | (requerido) | Path absoluto al Vault |
| `SYNC_INTERVAL_MS` | `5000` | Cada cuántos ms el worker procesa |
| `SYNC_BATCH_SIZE` | `50` | Eventos por lote |

### Cómo correr el worker

```bash
# Loop infinito
npm run sync:worker

# Una pasada (para tests/cron)
npm run sync:once
```

### Auto-start

Ver `docs/DEPLOYMENT-SELFHOSTED.md` para systemd / NSSM.

---

## Troubleshooting

### Worker no procesa eventos

```bash
# Ver eventos pendientes
psql -d finora -c "SELECT status, COUNT(*) FROM \"SyncEvent\" GROUP BY status;"

# Forzar procesamiento
npm run sync:once

# Ver errores
psql -d finora -c "SELECT \"lastError\", COUNT(*) FROM \"SyncEvent\" WHERE status='FAILED' GROUP BY \"lastError\";"
```

### Regenerar Vault desde cero

```bash
# 1. Verificar DB
DATABASE_URL=... npm run vault:integrity

# 2. Si difieren: rebuild completo (archiva los actuales en 99 System/Deleted)
DATABASE_URL=... OBSIDIAN_VAULT_PATH=... npm run vault:rebuild
```

### Restaurar DB desde Vault

```bash
# 1. DRY RUN (preview)
DATABASE_URL=... OBSIDIAN_VAULT_PATH=... npm run vault:restore:dry

# 2. Si el preview está OK: restore real
DATABASE_URL=... OBSIDIAN_VAULT_PATH=... npm run vault:restore
# Pide confirmación interactiva.
```