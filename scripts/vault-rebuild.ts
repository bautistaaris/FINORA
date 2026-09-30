/* eslint-disable no-console */
/**
 * FINORA — Rebuild Vault: PostgreSQL → Obsidian Vault
 *
 * Regenera TODOS los archivos Markdown a partir del estado actual de la DB.
 *
 * Uso:
 *   npm run vault:rebuild                  # rebuildea todas las entidades
 *   npm run vault:rebuild -- --entity=Transaction
 *   npm run vault:rebuild -- --user=USER_ID
 *   npm run vault:rebuild -- --dry-run     # no escribe, sólo simula
 *
 * Reglas:
 *  - Trabaja únicamente dentro de Vault/FINORA/
 *  - Antes de reemplazar un archivo, lo mueve a 99 System/Deleted/{YYYY-MM-DD}/
 *    (preserva historial)
 *  - No toca ninguna otra nota fuera de FINORA/
 *  - Verifica que OBSIDIAN_VAULT_PATH esté configurado
 */

import { PrismaClient } from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";
import { atomicWrite, ensureDir, fileExists } from "../src/lib/obsidian/writer";
import { buildEntityFile } from "../src/lib/obsidian/handlers";
import { dirFor, finoraRoot } from "../src/lib/obsidian/paths";

const prisma = new PrismaClient();

interface Args {
  dryRun: boolean;
  entity?: string;
  userId?: string;
}

function parseArgs(): Args {
  const args: Args = { dryRun: false };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a?.startsWith("--entity=")) args.entity = a.split("=")[1];
    else if (a?.startsWith("--user=")) args.userId = a.split("=")[1];
  }
  return args;
}

async function main() {
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
  if (!vaultPath) {
    console.error("✗ OBSIDIAN_VAULT_PATH no está configurado.");
    process.exit(1);
  }
  const args = parseArgs();
  console.log(`→ Rebuild Vault desde: ${vaultPath}`);
  console.log(`  dryRun: ${args.dryRun}`);
  if (args.entity) console.log(`  entity filter: ${args.entity}`);
  if (args.userId) console.log(`  user filter: ${args.userId}`);

  const userId = args.userId ?? (await getSingleUserId());
  if (!userId) {
    console.error("✗ No hay usuarios en la DB. ¿Corriste db:seed?");
    process.exit(1);
  }

  const finoraDir = finoraRoot(vaultPath);
  await ensureDir(finoraDir);

  const stats = {
    accounts: 0,
    transactions: 0,
    investments: 0,
    subscriptions: 0,
    budgets: 0,
    debts: 0,
    recurringTransactions: 0,
    netWorthSnapshots: 0,
    errors: [] as string[],
  };

  if (!args.entity || args.entity === "Account") {
    const accounts = await prisma.account.findMany({ where: { userId } });
    for (const acc of accounts) {
      try {
        const built = buildEntityFile({
          vaultPath,
          entityType: "Account",
          payload: { ...acc },
          recordVersion: 1,
        });
        if (!args.dryRun) {
          await safeWrite(built.filePath, built.markdown, vaultPath);
        }
        stats.accounts++;
      } catch (err) {
        stats.errors.push(`Account ${acc.id}: ${err}`);
      }
    }
  }

  if (!args.entity || args.entity === "Transaction") {
    const txs = await prisma.transaction.findMany({
      where: { userId },
      include: { account: true, destinationAccount: true, category: true },
    });
    for (const tx of txs) {
      try {
        const built = buildEntityFile({
          vaultPath,
          entityType: "Transaction",
          payload: {
            ...tx,
            account: tx.account
              ? { id: tx.account.id, name: tx.account.name, currency: tx.account.currency }
              : null,
            destinationAccount: tx.destinationAccount
              ? { id: tx.destinationAccount.id, name: tx.destinationAccount.name }
              : null,
            category: tx.category
              ? { id: tx.category.id, name: tx.category.name, type: tx.category.type }
              : null,
          },
          recordVersion: 1,
        });
        if (!args.dryRun) {
          await safeWrite(built.filePath, built.markdown, vaultPath);
        }
        stats.transactions++;
      } catch (err) {
        stats.errors.push(`Transaction ${tx.id}: ${err}`);
      }
    }
  }

  if (!args.entity || args.entity === "Investment") {
    const invs = await prisma.investment.findMany({ where: { userId } });
    for (const inv of invs) {
      try {
        const built = buildEntityFile({
          vaultPath,
          entityType: "Investment",
          payload: { ...inv },
          recordVersion: 1,
        });
        if (!args.dryRun) {
          await safeWrite(built.filePath, built.markdown, vaultPath);
        }
        stats.investments++;
      } catch (err) {
        stats.errors.push(`Investment ${inv.id}: ${err}`);
      }
    }
  }

  if (!args.entity || args.entity === "Subscription") {
    const subs = await prisma.subscription.findMany({ where: { userId } });
    for (const s of subs) {
      try {
        const built = buildEntityFile({
          vaultPath,
          entityType: "Subscription",
          payload: { ...s },
          recordVersion: 1,
        });
        if (!args.dryRun) {
          await safeWrite(built.filePath, built.markdown, vaultPath);
        }
        stats.subscriptions++;
      } catch (err) {
        stats.errors.push(`Subscription ${s.id}: ${err}`);
      }
    }
  }

  if (!args.entity || args.entity === "Budget") {
    const budgets = await prisma.budget.findMany({
      where: { userId },
      include: { category: true },
    });
    for (const b of budgets) {
      try {
        const built = buildEntityFile({
          vaultPath,
          entityType: "Budget",
          payload: {
            ...b,
            category: b.category
              ? { id: b.category.id, name: b.category.name, type: b.category.type }
              : null,
          },
          recordVersion: 1,
        });
        if (!args.dryRun) {
          await safeWrite(built.filePath, built.markdown, vaultPath);
        }
        stats.budgets++;
      } catch (err) {
        stats.errors.push(`Budget ${b.id}: ${err}`);
      }
    }
  }

  if (!args.entity || args.entity === "Debt") {
    const debts = await prisma.debt.findMany({ where: { userId } });
    for (const d of debts) {
      try {
        const built = buildEntityFile({
          vaultPath,
          entityType: "Debt",
          payload: { ...d },
          recordVersion: 1,
        });
        if (!args.dryRun) {
          await safeWrite(built.filePath, built.markdown, vaultPath);
        }
        stats.debts++;
      } catch (err) {
        stats.errors.push(`Debt ${d.id}: ${err}`);
      }
    }
  }

  console.log("\n✓ Rebuild completo:");
  console.log(`   Accounts:           ${stats.accounts}`);
  console.log(`   Transactions:       ${stats.transactions}`);
  console.log(`   Investments:        ${stats.investments}`);
  console.log(`   Subscriptions:      ${stats.subscriptions}`);
  console.log(`   Budgets:            ${stats.budgets}`);
  console.log(`   Debts:              ${stats.debts}`);
  if (stats.errors.length > 0) {
    console.log(`\n✗ ${stats.errors.length} errores:`);
    for (const e of stats.errors) console.log(`   ${e}`);
    process.exit(1);
  }
}

async function getSingleUserId(): Promise<string | null> {
  const u = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  return u?.id ?? null;
}

async function safeWrite(filePath: string, content: string, vaultPath: string) {
  // Si el archivo ya existe, archivarlo primero
  if (await fileExists(filePath)) {
    const today = new Date().toISOString().slice(0, 10);
    const archiveDir = path.join(finoraRoot(vaultPath), "99 System", "Deleted", today);
    await ensureDir(archiveDir);
    const base = path.basename(filePath);
    let target = path.join(archiveDir, `rebuild__${base}`);
    let i = 1;
    while (await fileExists(target)) {
      const ext = path.extname(base);
      const stem = base.slice(0, base.length - ext.length);
      target = path.join(archiveDir, `rebuild__${stem}__${i}${ext}`);
      i++;
    }
    await fs.rename(filePath, target);
  }
  await atomicWrite(filePath, content);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });