/**
 * FINORA — Outbox pattern helpers.
 *
 * Cada mutación financiera debe crear un SyncEvent en la MISMA transacción
 * PostgreSQL que modifica la entidad.
 *
 * Garantías:
 *  - Atómico: si la entidad se guarda, el evento también
 *  - Idempotente en destino: el evento incluye el snapshot completo
 *  - Recuperable: si el worker falla, el evento queda PENDING/FAILED
 *  - Auditable: recordVersion + attempts + lastError
 */

import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export type OutboxOperation = "CREATE" | "UPDATE" | "DELETE";

export const MAX_ATTEMPTS = 10;
export const BACKOFF_BASE_MS = 5_000; // 5s, 10s, 20s, 40s, ...

export async function enqueueOutbox(
  tx: Prisma.TransactionClient,
  args: {
    userId: string;
    entityType: string;
    entityId: string;
    operation: OutboxOperation;
    payload: unknown;
    recordVersion?: number;
  },
): Promise<void> {
  await tx.syncEvent.create({
    data: {
      userId: args.userId,
      entityType: args.entityType,
      entityId: args.entityId,
      operation: args.operation,
      payload: JSON.parse(JSON.stringify(args.payload ?? {})),
      recordVersion: args.recordVersion ?? 1,
      status: "PENDING",
    },
  });
}

/**
 * Devuelve la cantidad de eventos pendientes (no procesados).
 */
export async function getPendingCount(userId: string): Promise<number> {
  return prisma.syncEvent.count({
    where: { userId, status: { in: ["PENDING", "FAILED"] } },
  });
}

export async function getFailedCount(userId: string): Promise<number> {
  return prisma.syncEvent.count({
    where: { userId, status: "FAILED" },
  });
}

/**
 * Backoff exponencial para reintentos.
 * attempts = número de reintentos hechos.
 */
export function nextRetryDelayMs(attempts: number): number {
  const exp = Math.min(attempts, 8); // tope de 2^8 = 256x
  return BACKOFF_BASE_MS * Math.pow(2, exp);
}