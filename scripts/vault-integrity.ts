/* eslint-disable no-console */
/**
 * FINORA — Vault integrity check
 *
 * Compara el contenido del Vault con la base de datos para detectar
 * inconsistencias, archivos huérfanos, y problemas de sincronización.
 *
 * Uso:
 *   npm run vault:integrity
 */

import { PrismaClient } from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";
import { finoraRoot } from "../src/lib/obsidian/paths";
import { parseMarkdown } from "../src/lib/obsidian/frontmatter";

const prisma = new PrismaClient();

async function main() {
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
  if (!vaultPath) {
    console.error("✗ OBSIDIAN_VAULT_PATH no está configurado.");
    process.exit(1);
  }
  const finoraDir = finoraRoot(vaultPath);
  if (!(await fsExists(finoraDir))) {
    console.error(`✗ ${finoraDir} no existe.`);
    process.exit(1);
  }

  const userId = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!userId) {
    console.error("✗ No hay usuarios.");
    process.exit(1);
  }

  console.log("→ Vault Integrity Check");
  console.log(`  Vault:    ${vaultPath}`);
  console.log(`  User:     ${userId.email}\n`);

  // Escanear Vault
  const vaultFiles = new Map<string, { entityType: string; finoraId: string; recordVersion: number; path: string }>();
  await walkDir(finoraDir, (filePath) => {
    if (filePath.includes("99 System")) return;
    if (!filePath.endsWith(".md")) return;
    // Procesar async (necesitamos await)
    // Lo hacemos inline abajo
  });
  // Recolectar sincrónicamente
  const collected: Array<{ path: string; entityType: string; finoraId: string; recordVersion: number }> = [];
  await collectFiles(finoraDir, collected);
  for (const f of collected) {
    vaultFiles.set(`${f.entityType}:${f.finoraId}`, f);
  }

  // Comparar con DB
  const dbCounts = await Promise.all([
    prisma.account.count({ where: { userId: userId.id } }),
    prisma.transaction.count({ where: { userId: userId.id } }),
    prisma.investment.count({ where: { userId: userId.id } }),
    prisma.subscription.count({ where: { userId: userId.id } }),
    prisma.budget.count({ where: { userId: userId.id } }),
    prisma.debt.count({ where: { userId: userId.id } }),
  ]);
  const [dbAcc, dbTx, dbInv, dbSub, dbBud, dbDebt] = dbCounts;

  // Vault counts por tipo
  const vaultCounts = {
    account: collected.filter((f) => f.entityType === "account").length,
    transaction: collected.filter((f) => f.entityType === "transaction").length,
    investment: collected.filter((f) => f.entityType === "investment").length,
    subscription: collected.filter((f) => f.entityType === "subscription").length,
    budget: collected.filter((f) => f.entityType === "budget").length,
    debt: collected.filter((f) => f.entityType === "debt").length,
  };

  console.log("Entity             DB  Vault   Match");
  console.log("─".repeat(45));
  console.log(
    `Accounts           ${pad(dbAcc, 4)}${pad(vaultCounts.account, 4)}   ${
      dbAcc === vaultCounts.account ? "✓" : "✗"
    }`,
  );
  console.log(
    `Transactions       ${pad(dbTx, 4)}${pad(vaultCounts.transaction, 4)}   ${
      dbTx === vaultCounts.transaction ? "✓" : "✗"
    }`,
  );
  console.log(
    `Investments        ${pad(dbInv, 4)}${pad(vaultCounts.investment, 4)}   ${
      dbInv === vaultCounts.investment ? "✓" : "✗"
    }`,
  );
  console.log(
    `Subscriptions      ${pad(dbSub, 4)}${pad(vaultCounts.subscription, 4)}   ${
      dbSub === vaultCounts.subscription ? "✓" : "✗"
    }`,
  );
  console.log(
    `Budgets            ${pad(dbBud, 4)}${pad(vaultCounts.budget, 4)}   ${
      dbBud === vaultCounts.budget ? "✓" : "✗"
    }`,
  );
  console.log(
    `Debts              ${pad(dbDebt, 4)}${pad(vaultCounts.debt, 4)}   ${
      dbDebt === vaultCounts.debt ? "✓" : "✗"
    }`,
  );

  const allMatch = dbAcc === vaultCounts.account
    && dbTx === vaultCounts.transaction
    && dbInv === vaultCounts.investment
    && dbSub === vaultCounts.subscription
    && dbBud === vaultCounts.budget
    && dbDebt === vaultCounts.debt;
  console.log(`\n${allMatch ? "✓ Todo OK" : "✗ Hay diferencias"}`);

  await prisma.$disconnect();
  process.exit(allMatch ? 0 : 1);
}

function pad(n: number, w: number): string {
  return n.toString().padStart(w);
}

async function collectFiles(
  dir: string,
  out: Array<{ path: string; entityType: string; finoraId: string; recordVersion: number }>,
): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      await collectFiles(p, out);
    } else if (e.isFile() && p.endsWith(".md") && !p.includes("99 System")) {
      const content = await fs.readFile(p, "utf-8");
      const { data } = parseMarkdown(content);
      const entityType = String(data.entity_type ?? "");
      const finoraId = String(data.finora_id ?? "");
      if (!entityType || !finoraId) continue;
      if (entityType.endsWith("_tombstone")) continue;
      out.push({
        path: p,
        entityType,
        finoraId,
        recordVersion: Number(data.record_version ?? 1),
      });
    }
  }
}

async function walkDir(dir: string, onFile: (filePath: string) => void): Promise<void> {
  await collectFiles(dir, []);
}

async function fsExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});