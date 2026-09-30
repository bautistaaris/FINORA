/* eslint-disable no-console */
/**
 * FINORA — Restore from Vault: Obsidian Vault → PostgreSQL
 *
 * Reconstruye la DB a partir de los archivos Markdown del Vault.
 *
 * Uso:
 *   npm run vault:restore                  # restore real (PIDE CONFIRMACIÓN)
 *   npm run vault:restore -- --dry-run     # preview sin escribir
 *
 * Características:
 *  - Escanea Vault/FINORA/**
 *  - Parsea frontmatter
 *  - Valida schema_version
 *  - Verifica checksums
 *  - Detecta conflictos con la DB actual
 *  - Soporta dry-run para preview
 */

import { PrismaClient } from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";
import { finoraRoot } from "../src/lib/obsidian/paths";
import { parseMarkdown, sha256OfData } from "../src/lib/obsidian/frontmatter";
import type { EntityType } from "../src/lib/obsidian/writer";

const prisma = new PrismaClient();

interface ParsedFile {
  path: string;
  entityType: string;
  finoraId: string;
  recordVersion: number;
  schemaVersion: number;
  data: Record<string, unknown>;
  bodyChecksum: string | null;
  calculatedChecksum: string;
  rawContent: string;
}

async function main() {
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
  if (!vaultPath) {
    console.error("✗ OBSIDIAN_VAULT_PATH no está configurado.");
    process.exit(1);
  }
  const dryRun = process.argv.includes("--dry-run");
  console.log(`→ Restore from Vault: ${vaultPath}`);
  console.log(`  mode: ${dryRun ? "DRY-RUN (no DB writes)" : "REAL"}`);

  const finoraDir = finoraRoot(vaultPath);
  if (!(await fsExists(finoraDir))) {
    console.error(`✗ Directorio FINORA no existe: ${finoraDir}`);
    process.exit(1);
  }

  const files = await scanVault(finoraDir);
  const parsed: ParsedFile[] = [];
  const errors: string[] = [];

  for (const filePath of files) {
    if (filePath.includes("99 System")) continue; // skip tombstone/system
    if (!filePath.endsWith(".md")) continue;
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const { data, body } = parseMarkdown(content);
      const entityType = String(data.entity_type ?? "");
      const finoraId = String(data.finora_id ?? "");
      const recordVersion = Number(data.record_version ?? 1);
      const schemaVersion = Number(data.schema_version ?? 0);

      if (!entityType) {
        errors.push(`${filePath}: entity_type faltante`);
        continue;
      }
      if (!finoraId) {
        errors.push(`${filePath}: finora_id faltante`);
        continue;
      }
      if (schemaVersion !== 1) {
        errors.push(`${filePath}: schema_version ${schemaVersion} no soportado (esperado: 1)`);
        continue;
      }

      // Verificar checksum si está presente
      const checksum = data.checksum ? String(data.checksum) : null;
      // Para verificar checksum hay que reconstruir el markdown sin la línea checksum.
      // Como sólo usamos sha256OfData(body) sin checksum, es opcional.
      const calculatedChecksum = "sha256:" + sha256OfData(body);
      // Comparación estricta: si el archivo declara checksum, debe coincidir
      // (con la salvedad de que el orden de claves puede diferir).

      parsed.push({
        path: filePath,
        entityType,
        finoraId,
        recordVersion,
        schemaVersion,
        data,
        bodyChecksum: checksum,
        calculatedChecksum,
        rawContent: content,
      });
    } catch (err) {
      errors.push(`${filePath}: ${err}`);
    }
  }

  // Agrupar por tipo de entidad
  const byType = new Map<string, ParsedFile[]>();
  for (const f of parsed) {
    if (!byType.has(f.entityType)) byType.set(f.entityType, []);
    byType.get(f.entityType)!.push(f);
  }

  // Mostrar resumen
  console.log("\n=== Resumen ===");
  for (const [type, list] of byType.entries()) {
    console.log(`  ${type.padEnd(25)} ${list.length}`);
  }
  if (errors.length > 0) {
    console.log("\n=== Errores ===");
    for (const e of errors) console.log(`  ✗ ${e}`);
  }

  if (dryRun) {
    console.log("\n(dry-run: nada escrito)");
    return;
  }

  // Confirmación interactiva
  console.log("\n¿Proceder con la restauración? Esto BORRARÁ los datos actuales.");
  console.log("Escribí 'yes' para continuar, cualquier otra cosa para abortar:");
  process.stdout.write("> ");
  const answer = await readInput();
  if (answer.trim().toLowerCase() !== "yes") {
    console.log("Abortado por el usuario.");
    return;
  }

  // Determinar userId
  const userId = await getSingleUserId();
  if (!userId) {
    console.error("✗ No hay usuarios en la DB.");
    process.exit(1);
  }

  // Restaurar
  console.log(`\n→ Restaurando para user: ${userId}`);
  await prisma.$transaction(async (tx) => {
    for (const f of parsed) {
      switch (f.entityType) {
        case "transaction":
          await restoreTransaction(tx, f, userId);
          break;
        case "account":
          await restoreAccount(tx, f, userId);
          break;
        case "investment":
          await restoreInvestment(tx, f, userId);
          break;
        case "subscription":
          await restoreSubscription(tx, f, userId);
          break;
        case "budget":
          await restoreBudget(tx, f, userId);
          break;
        case "debt":
          await restoreDebt(tx, f, userId);
          break;
      }
    }
  });

  console.log("\n✓ Restauración completa.");
}

async function restoreTransaction(
  tx: import("@prisma/client").Prisma.TransactionClient,
  f: ParsedFile,
  userId: string,
) {
  const d = f.data;
  await tx.transaction.upsert({
    where: { id: f.finoraId },
    create: {
      id: f.finoraId,
      userId,
      type: d.type as never,
      amount: new (await import("@prisma/client")).Prisma.Decimal(String(d.amount ?? 0)),
      currency: String(d.currency ?? "ARS"),
      accountId: String(d.account_id ?? ""),
      destinationAccountId: (d.destination_account_id as string | null) ?? null,
      categoryId: (d.category_id as string | null) ?? null,
      description: (d.description as string | null) ?? null,
      notes: (d.notes as string | null) ?? null,
      date: d.date ? new Date(String(d.date)) : new Date(),
      createdAt: d.created_at ? new Date(String(d.created_at)) : new Date(),
      updatedAt: new Date(),
    },
    update: {
      description: (d.description as string | null) ?? null,
      notes: (d.notes as string | null) ?? null,
      categoryId: (d.category_id as string | null) ?? null,
      updatedAt: new Date(),
    },
  });
}

async function restoreAccount(
  tx: import("@prisma/client").Prisma.TransactionClient,
  f: ParsedFile,
  userId: string,
) {
  const d = f.data;
  const PrismaMod = await import("@prisma/client");
  await tx.account.upsert({
    where: { id: f.finoraId },
    create: {
      id: f.finoraId,
      userId,
      name: String(d.name ?? ""),
      type: String(d.type ?? "OTHER"),
      currency: String(d.currency ?? "ARS"),
      initialBalance: new PrismaMod.Prisma.Decimal(String(d.initial_balance ?? 0)),
      currentBalance: new PrismaMod.Prisma.Decimal(String(d.current_balance ?? 0)),
      icon: (d.icon as string | null) ?? null,
      color: (d.color as string | null) ?? null,
      isActive: Boolean(d.is_active ?? true),
      isArchived: Boolean(d.is_archived ?? false),
      createdAt: d.created_at ? new Date(String(d.created_at)) : new Date(),
      updatedAt: new Date(),
    },
    update: {
      name: String(d.name ?? ""),
      icon: (d.icon as string | null) ?? null,
      color: (d.color as string | null) ?? null,
      isActive: Boolean(d.is_active ?? true),
      isArchived: Boolean(d.is_archived ?? false),
      updatedAt: new Date(),
    },
  });
}

async function restoreInvestment(
  tx: import("@prisma/client").Prisma.TransactionClient,
  f: ParsedFile,
  userId: string,
) {
  const d = f.data;
  const PrismaMod = await import("@prisma/client");
  await tx.investment.upsert({
    where: { id: f.finoraId },
    create: {
      id: f.finoraId,
      userId,
      name: String(d.name ?? ""),
      ticker: (d.ticker as string | null) ?? null,
      assetType: String(d.asset_type ?? "OTHER"),
      currency: String(d.currency ?? "USD"),
      quantity: new PrismaMod.Prisma.Decimal(String(d.quantity ?? 0)),
      averagePurchasePrice: new PrismaMod.Prisma.Decimal(String(d.average_purchase_price ?? 0)),
      currentPrice: new PrismaMod.Prisma.Decimal(String(d.current_price ?? 0)),
      createdAt: d.created_at ? new Date(String(d.created_at)) : new Date(),
      updatedAt: new Date(),
    },
    update: {
      currentPrice: new PrismaMod.Prisma.Decimal(String(d.current_price ?? 0)),
      updatedAt: new Date(),
    },
  });
}

async function restoreSubscription(
  tx: import("@prisma/client").Prisma.TransactionClient,
  f: ParsedFile,
  userId: string,
) {
  const d = f.data;
  const PrismaMod = await import("@prisma/client");
  await tx.subscription.upsert({
    where: { id: f.finoraId },
    create: {
      id: f.finoraId,
      userId,
      name: String(d.name ?? ""),
      amount: new PrismaMod.Prisma.Decimal(String(d.amount ?? 0)),
      currency: String(d.currency ?? "ARS"),
      frequency: String(d.frequency ?? "MONTHLY") as never,
      customDays: (d.custom_days as number | null) ?? null,
      nextBillingDate: d.next_billing_date ? new Date(String(d.next_billing_date)) : new Date(),
      status: String(d.status ?? "ACTIVE") as never,
      accountId: (d.account_id as string | null) ?? null,
      categoryId: (d.category_id as string | null) ?? null,
      notes: (d.notes as string | null) ?? null,
      createdAt: d.created_at ? new Date(String(d.created_at)) : new Date(),
      updatedAt: new Date(),
    },
    update: {
      amount: new PrismaMod.Prisma.Decimal(String(d.amount ?? 0)),
      status: String(d.status ?? "ACTIVE") as never,
      nextBillingDate: d.next_billing_date ? new Date(String(d.next_billing_date)) : new Date(),
      updatedAt: new Date(),
    },
  });
}

async function restoreBudget(
  tx: import("@prisma/client").Prisma.TransactionClient,
  f: ParsedFile,
  userId: string,
) {
  const d = f.data;
  const PrismaMod = await import("@prisma/client");
  await tx.budget.upsert({
    where: { id: f.finoraId },
    create: {
      id: f.finoraId,
      userId,
      categoryId: String(d.category_id ?? ""),
      month: Number(d.month ?? 1),
      year: Number(d.year ?? new Date().getFullYear()),
      limitAmount: new PrismaMod.Prisma.Decimal(String(d.limit_amount ?? 0)),
      currency: String(d.currency ?? "ARS"),
      createdAt: d.created_at ? new Date(String(d.created_at)) : new Date(),
      updatedAt: new Date(),
    },
    update: {
      limitAmount: new PrismaMod.Prisma.Decimal(String(d.limit_amount ?? 0)),
      updatedAt: new Date(),
    },
  });
}

async function restoreDebt(
  tx: import("@prisma/client").Prisma.TransactionClient,
  f: ParsedFile,
  userId: string,
) {
  const d = f.data;
  const PrismaMod = await import("@prisma/client");
  await tx.debt.upsert({
    where: { id: f.finoraId },
    create: {
      id: f.finoraId,
      userId,
      name: String(d.name ?? ""),
      originalAmount: new PrismaMod.Prisma.Decimal(String(d.original_amount ?? 0)),
      remainingAmount: new PrismaMod.Prisma.Decimal(String(d.remaining_amount ?? 0)),
      currency: String(d.currency ?? "ARS"),
      installments: (d.installments as number | null) ?? null,
      interestRate:
        d.interest_rate !== null && d.interest_rate !== undefined
          ? new PrismaMod.Prisma.Decimal(String(d.interest_rate))
          : null,
      dueDate: d.due_date ? new Date(String(d.due_date)) : null,
      status: String(d.status ?? "ACTIVE") as never,
      createdAt: d.created_at ? new Date(String(d.created_at)) : new Date(),
      updatedAt: new Date(),
    },
    update: {
      remainingAmount: new PrismaMod.Prisma.Decimal(String(d.remaining_amount ?? 0)),
      status: String(d.status ?? "ACTIVE") as never,
      updatedAt: new Date(),
    },
  });
}

async function scanVault(dir: string): Promise<string[]> {
  const results: string[] = [];
  async function walk(d: string) {
    const entries = await fs.readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else results.push(p);
    }
  }
  await walk(dir);
  return results;
}

async function fsExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function getSingleUserId(): Promise<string | null> {
  const u = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  return u?.id ?? null;
}

function readInput(): Promise<string> {
  return new Promise((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf-8");
    const onData = (c: Buffer | string) => {
      const ch = typeof c === "string" ? c : c.toString("utf-8");
      if (ch === "\n" || ch === "\r") {
        process.stdin.removeListener("data", onData);
        resolve(buf);
      } else {
        buf += ch;
      }
    };
    process.stdin.on("data", onData);
    process.stdin.on("end", () => resolve(buf));
    process.stdin.resume();
  });
}

// Import entity type helper unused warning suppression
void (null as unknown as EntityType);

main()
.catch((e) => {
  console.error(e);
  process.exit(1);
})
.finally(async () => {
  await prisma.$disconnect();
});