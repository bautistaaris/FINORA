/**
 * FINORA — Sync worker.
 *
 * Procesa eventos pendientes del outbox y los traduce a archivos Markdown
 * en el Vault de Obsidian.
 *
 * Características:
 *  - Idempotente: si el evento ya fue procesado, no hace nada
 *  - Retry con backoff exponencial (hasta MAX_ATTEMPTS)
 *  - Lock optimista via status PROCESSING (previene doble processing en paralelo)
 *  - Borra archivos viejos al hacer UPDATE (idempotencia al reescribir)
 *  - Mueve archivos a 99 System/Deleted/ al hacer DELETE
 *
 * Puede correr:
 *  - Como proceso independiente (npm run sync-worker)
 *  - Como cron job
 *  - Como módulo dentro de Next.js (background task)
 */

import { prisma } from "@/lib/db";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  atomicWrite,
  fileExists,
  moveToDeleted,
  type EntityType,
} from "@/lib/obsidian/writer";
import {
  buildEntityFile,
  buildTombstone,
  type BuildResult,
} from "@/lib/obsidian/handlers";
import { deletedDir, dirFor, finoraRoot, FINORA_SCHEMA_VERSION } from "@/lib/obsidian/paths";
import {
  enqueueOutbox,
  getPendingCount,
  nextRetryDelayMs,
  MAX_ATTEMPTS,
  type OutboxOperation,
} from "@/lib/sync/outbox";

const BATCH_SIZE = 50;
const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000; // 5 min — lock expira

export interface WorkerConfig {
  vaultPath: string;
  batchSize?: number;
  /**
   * Si true, no escribe archivos (sólo procesa y marca como completed).
   * Útil para tests.
   */
  dryRun?: boolean;
  /**
   * Si true, registra cada paso en consola.
   */
  verbose?: boolean;
}

export interface WorkerStats {
  processed: number;
  failed: number;
  skipped: number;
  errors: Array<{ id: string; error: string }>;
}

/* eslint-disable */

function isEntityType(s: string): s is EntityType {
  return [
    "Transaction",
    "Account",
    "Investment",
    "InvestmentTransaction",
    "Subscription",
    "Budget",
    "Debt",
    "RecurringTransaction",
    "NetWorthSnapshot",
  ].includes(s);
}

/**
 * Procesa un lote de eventos pendientes.
 * Devuelve estadísticas del lote.
 */
export async function processBatch(config: WorkerConfig): Promise<WorkerStats> {
  const stats: WorkerStats = { processed: 0, failed: 0, skipped: 0, errors: [] };
  const batchSize = config.batchSize ?? BATCH_SIZE;
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - PROCESSING_TIMEOUT_MS);

  // Buscar eventos PENDING o FAILED (respetando backoff)
  const events = await prisma.syncEvent.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      attempts: { lt: MAX_ATTEMPTS },
      OR: [
        { status: "PENDING" },
        {
          status: "FAILED",
          // Para FAILED, intentar de nuevo después del backoff
          // No tenemos "next_retry_at", usamos lastError timestamp aproximado
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });

  // Filtrar los que aún están en backoff (FAILED muy recientes)
  const candidates = events.filter((e) => {
    if (e.status === "PENDING") return true;
    const elapsedMs = now.getTime() - e.createdAt.getTime();
    return elapsedMs >= nextRetryDelayMs(e.attempts);
  });

  for (const event of candidates) {
    // Tomar lock optimista
    const lock = await prisma.syncEvent.updateMany({
      where: {
        id: event.id,
        status: { in: ["PENDING", "FAILED"] },
        attempts: event.attempts, // si alguien incrementó attempts, no chocar
      },
      data: {
        status: "PROCESSING",
        lastError: null,
      },
    });
    if (lock.count === 0) {
      stats.skipped++;
      continue;
    }
    try {
      // Liberar locks stale
      await prisma.syncEvent.updateMany({
        where: {
          status: "PROCESSING",
          createdAt: { lt: staleCutoff },
        },
        data: { status: "PENDING" },
      });

      await processEvent(event, config);
      await prisma.syncEvent.update({
        where: { id: event.id },
        data: { status: "COMPLETED", processedAt: new Date(), lastError: null },
      });
      stats.processed++;
      if (config.verbose) {
        console.log(`✓ ${event.entityType}:${event.operation} ${event.entityId}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const newAttempts = event.attempts + 1;
      const finalStatus = newAttempts >= MAX_ATTEMPTS ? "FAILED" : "FAILED";
      await prisma.syncEvent.update({
        where: { id: event.id },
        data: {
          status: finalStatus,
          attempts: newAttempts,
          lastError: errorMsg.slice(0, 1000),
        },
      });
      stats.failed++;
      stats.errors.push({ id: event.id, error: errorMsg });
      if (config.verbose) {
        console.error(`✗ ${event.entityType}:${event.operation} ${event.entityId} → ${errorMsg}`);
      }
    }
  }

  return stats;
}

async function processEvent(
  event: {
    id: string;
    userId: string;
    entityType: string;
    entityId: string;
    operation: string;
    payload: any;
    recordVersion: number;
  },
  config: WorkerConfig,
): Promise<void> {
  const { vaultPath, dryRun = false } = config;

  if (!isEntityType(event.entityType)) {
    throw new Error(`Unknown entity type: ${event.entityType}`);
  }

  // DELETE: mover archivo a 99 System/Deleted
  if (event.operation === "DELETE") {
    if (dryRun) return;
    const targetPath = await findExistingFileForEntity(vaultPath, event.entityType, event.entityId);
    if (targetPath && (await fileExists(targetPath))) {
      const deleted = deletedDir(vaultPath, new Date());
      await moveToDeleted(targetPath, deleted);
      const tm = buildTombstone({
        originalFileName: path.basename(targetPath),
        finoraId: event.entityId,
        entityType: event.entityType,
        deletedAt: new Date(),
        recordVersion: event.recordVersion,
      });
      const tombstoneName = path.basename(targetPath).replace(/\.md$/, ".tombstone.md");
      await atomicWrite(path.join(deleted, tombstoneName), tm.markdown);
    }
    return;
  }

  // CREATE / UPDATE: generar markdown
  const built = buildEntityFile({
    vaultPath,
    entityType: event.entityType,
    payload: event.payload,
    recordVersion: event.recordVersion,
  });

  if (dryRun) return;

  // Validar schema_version del payload
  if (
    built.markdown &&
    !built.markdown.includes(`schema_version: ${FINORA_SCHEMA_VERSION}`)
  ) {
    throw new Error(
      `Generated markdown missing schema_version ${FINORA_SCHEMA_VERSION}`,
    );
  }

  // Para UPDATE: borrar archivo viejo (mismo ID corto)
  if (event.operation === "UPDATE") {
    const oldPath = await findExistingFileForEntity(vaultPath, event.entityType, event.entityId);
    if (oldPath && oldPath !== built.filePath && (await fileExists(oldPath))) {
      const deleted = deletedDir(vaultPath, new Date());
      await moveToDeleted(oldPath, deleted);
    }
  }

  await atomicWrite(built.filePath, built.markdown);
}

/**
 * Busca el archivo existente para una entidad, leyendo el directorio.
 * Usa el ID corto del entityId para encontrar archivos `__{shortId}.md`.
 */
async function findExistingFileForEntity(
  vaultPath: string,
  entityType: EntityType,
  entityId: string,
): Promise<string | null> {
  try {
    const shortId = entityId.replace(/-/g, "").slice(0, 8).toLowerCase();
    const searchDirs: string[] = [];
    if (entityType === "Transaction") {
      searchDirs.push(dirFor(vaultPath, "Transaction"));
    } else {
      searchDirs.push(dirFor(vaultPath, entityType));
    }
    for (const dir of searchDirs) {
      const found = await scanDirForShortId(dir, shortId, entityType === "Transaction");
      if (found) return found;
    }
    return null;
  } catch {
    return null;
  }
}

async function scanDirForShortId(
  dir: string,
  shortId: string,
  recursive: boolean,
): Promise<string | null> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md") && entry.name.includes(`__${shortId}`)) {
        return path.join(dir, entry.name);
      }
      if (recursive && entry.isDirectory()) {
        const child = path.join(dir, entry.name);
        const found = await scanDirForShortId(child, shortId, recursive);
        if (found) return found;
      }
    }
    return null;
  } catch {
    return null;
  }
}

void { findExistingFileForEntity, processBatch };

/**
 * Loop principal del worker. Corre hasta que se cancele.
 */
export async function runWorker(
  config: WorkerConfig,
  options: { intervalMs?: number; maxIterations?: number; stopAfter?: number } = {},
): Promise<void> {
  const intervalMs = options.intervalMs ?? 5000;
  const maxIterations = options.maxIterations ?? Infinity;
  let iter = 0;
  while (iter < maxIterations) {
    const stats = await processBatch(config);
    if (stats.processed === 0 && stats.failed === 0 && stats.skipped === 0) {
      // Nada que procesar; esperar
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    iter++;
    if (options.stopAfter && iter >= options.stopAfter) break;
  }
}

/**
 * Helper para tests / scripts: procesar TODOS los pendientes una vez y volver.
 */
export async function processOnce(config: WorkerConfig): Promise<WorkerStats> {
  return processBatch(config);
}

export { finoraRoot, enqueueOutbox };
// Re-exportar el operador desde el módulo canónico
export type { OutboxOperation };