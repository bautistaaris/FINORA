/**
 * FINORA — Helpers compartidos para integrar el outbox en las APIs.
 *
 * Patrón:
 *  1. Mutación DB
 *  2. Encolar SyncEvent en la MISMA transacción Prisma
 *  3. Worker procesa después
 */

import { Prisma } from "@prisma/client";
import { enqueueOutbox } from "@/lib/sync/outbox";
import { serializeForClient } from "@/lib/finance";

/**
 * Devuelve el último recordVersion procesado/pendiente para una entidad.
 * Útil para incrementar la versión en cada mutación.
 */
export async function getLastRecordVersion(
  tx: Prisma.TransactionClient,
  entityType: string,
  entityId: string,
): Promise<number> {
  const last = await tx.syncEvent.findFirst({
    where: { entityType, entityId },
    orderBy: { recordVersion: "desc" },
    select: { recordVersion: true },
  });
  return last?.recordVersion ?? 0;
}

/**
 * Encola un evento CREATE/UPDATE a partir de una entidad DB completa.
 * Carga referencias comunes (account, category, etc.) y serializa a JSON-safe.
 */
export async function enqueueEntityEvent(
  tx: Prisma.TransactionClient,
  args: {
    userId: string;
    entityType:
      | "Transaction"
      | "Account"
      | "Investment"
      | "InvestmentTransaction"
      | "Subscription"
      | "Budget"
      | "Debt"
      | "RecurringTransaction"
      | "NetWorthSnapshot";
    entity: { id: string; [k: string]: unknown };
    operation: "CREATE" | "UPDATE" | "DELETE";
  },
): Promise<void> {
  const recordVersion = (await getLastRecordVersion(tx, args.entityType, args.entity.id)) + 1;

  // Cargar relaciones comunes según el tipo de entidad
  const enriched: Record<string, unknown> = { ...args.entity };
  if (args.entityType === "Transaction") {
    const e = args.entity as unknown as {
      accountId: string;
      destinationAccountId?: string | null;
      categoryId?: string | null;
    };
    const account = await tx.account.findUnique({ where: { id: e.accountId } });
    const destAccount = e.destinationAccountId
      ? await tx.account.findUnique({ where: { id: e.destinationAccountId } })
      : null;
    const category = e.categoryId
      ? await tx.category.findUnique({ where: { id: e.categoryId } })
      : null;
    enriched.account = account
      ? { id: account.id, name: account.name, currency: account.currency }
      : null;
    enriched.destinationAccount = destAccount
      ? { id: destAccount.id, name: destAccount.name }
      : null;
    enriched.category = category
      ? { id: category.id, name: category.name, type: category.type }
      : null;
  } else if (args.entityType === "Subscription") {
    const e = args.entity as unknown as { accountId?: string | null; categoryId?: string | null };
    if (e.categoryId) {
      const cat = await tx.category.findUnique({ where: { id: e.categoryId } });
      enriched.category = cat
        ? { id: cat.id, name: cat.name, type: cat.type }
        : null;
    }
  } else if (args.entityType === "Budget") {
    const e = args.entity as unknown as { categoryId: string };
    const cat = await tx.category.findUnique({ where: { id: e.categoryId } });
    enriched.category = cat
      ? { id: cat.id, name: cat.name, type: cat.type }
      : null;
  }

  await enqueueOutbox(tx, {
    userId: args.userId,
    entityType: args.entityType,
    entityId: args.entity.id,
    operation: args.operation,
    payload: serializeForClient(enriched),
    recordVersion,
  });
}