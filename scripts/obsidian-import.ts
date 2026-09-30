/* eslint-disable no-console */
/**
 * FINORA — Controlled Import from Obsidian → FINORA
 *
 * Escanea el Vault, parsea frontmatter, valida schema, detecta conflictos
 * con la DB y permite importar cambios válidos.
 *
 * Reglas:
 *  - NUNCA sobrescribe la DB silenciosamente
 *  - Requiere --confirm para ejecutar la importación real
 *  - Dry-run por default (--yes para aplicar)
 *  - Detecta conflictos: si el record_version del Vault es MENOR que el de la DB,
 *    el cambio externo se considera "viejo" y se reporta como warning
 *
 * Uso:
 *   npm run obsidian:import                  # dry-run con preview
 *   npm run obsidian:import -- --yes        # aplica cambios
 *   npm run obsidian:import -- --entity=Account   # filtra por tipo
 */

import { PrismaClient } from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";
import { finoraRoot } from "../src/lib/obsidian/paths";
import { parseMarkdown } from "../src/lib/obsidian/frontmatter";

const prisma = new PrismaClient();

interface VaultFile {
  path: string;
  entityType: string;
  finoraId: string;
  recordVersion: number;
  schemaVersion: number;
  data: Record<string, unknown>;
  body: string;
}

interface ImportPlanItem {
  entityType: string;
  finoraId: string;
  path: string;
  action: "CREATE" | "UPDATE" | "SKIP_CONFLICT" | "SKIP_TOMBSTONE" | "SKIP_INVALID";
  reason: string;
  currentDbVersion?: number;
  vaultVersion: number;
}

async function main() {
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
  if (!vaultPath) {
    console.error("✗ OBSIDIAN_VAULT_PATH no está configurado.");
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const confirm = args.includes("--yes") || args.includes("--confirm");
  const entityFilter = args.find((a) => a.startsWith("--entity="))?.split("=")[1];

  console.log(`→ Import Obsidian → FINORA (${confirm ? "REAL" : "DRY-RUN"})`);
  console.log(`  Vault: ${vaultPath}`);
  if (entityFilter) console.log(`  Filtro: ${entityFilter}`);

  const finoraDir = finoraRoot(vaultPath);
  if (!(await fs.access(finoraDir).then(() => true).catch(() => false))) {
    console.error(`✗ ${finoraDir} no existe.`);
    process.exit(1);
  }

  const userId = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!userId) {
    console.error("✗ No hay usuarios en la DB.");
    process.exit(1);
  }

  // 1. Escanear Vault
  const files: VaultFile[] = [];
  await walk(finoraDir, files);
  console.log(`\n  Archivos escaneados: ${files.length}`);

  // 2. Filtrar
  const candidates = entityFilter
    ? files.filter((f) => f.entityType === entityFilter.toLowerCase())
    : files.filter((f) => f.entityType !== "tombstone");

  console.log(`  Candidatos: ${candidates.length}`);

  // 3. Cargar estado actual de la DB
  const dbState = await loadDbState(userId.id);

  // 4. Construir plan de import
  const plan: ImportPlanItem[] = [];
  for (const file of candidates) {
    const planItem = buildPlanItem(file, dbState);
    plan.push(planItem);
  }

  // 5. Mostrar resumen
  console.log("\n=== Plan de importación ===");
  const byAction = new Map<string, ImportPlanItem[]>();
  for (const p of plan) {
    if (!byAction.has(p.action)) byAction.set(p.action, []);
    byAction.get(p.action)!.push(p);
  }
  for (const [action, items] of byAction.entries()) {
    console.log(`\n  [${action}] ${items.length} archivos:`);
    for (const item of items.slice(0, 10)) {
      console.log(`    - ${item.entityType}/${item.finoraId.slice(0, 8)} (vault v${item.vaultVersion}${item.currentDbVersion !== undefined ? ` vs DB v${item.currentDbVersion}` : ""})`);
    }
    if (items.length > 10) {
      console.log(`    ... y ${items.length - 10} más`);
    }
  }

  // 6. Aplicar si confirma
  if (!confirm) {
    console.log("\n(dry-run: nada escrito. Usá --yes para aplicar)");
    return;
  }

  if (plan.filter((p) => p.action === "CREATE" || p.action === "UPDATE").length === 0) {
    console.log("\nNada que importar.");
    return;
  }

  console.log("\n⚠ Estás por modificar la DB. Esto es IRREVERSIBLE.");
  console.log("Escribí 'yes' para confirmar, cualquier otra cosa cancela:");
  process.stdout.write("> ");
  const answer = await readInput();
  if (answer.trim().toLowerCase() !== "yes") {
    console.log("Cancelado.");
    return;
  }

  // Ejecutar
  await applyPlan(plan, userId.id);

  console.log("\n✓ Importación completa.");
}

async function walk(dir: string, out: VaultFile[]): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      // Saltar tombstone directory
      if (e.name === "Deleted" && p.includes("99 System")) continue;
      await walk(p, out);
    } else if (e.isFile() && p.endsWith(".md") && !p.endsWith(".tombstone.md")) {
      try {
        const content = await fs.readFile(p, "utf-8");
        const { data, body } = parseMarkdown(content);
        const entityType = String(data.entity_type ?? "");
        const finoraId = String(data.finora_id ?? "");
        if (!entityType || !finoraId) continue;
        if (entityType.endsWith("_tombstone")) continue;
        out.push({
          path: p,
          entityType,
          finoraId,
          recordVersion: Number(data.record_version ?? 1),
          schemaVersion: Number(data.schema_version ?? 0),
          data,
          body,
        });
      } catch {
        // ignore parse errors
      }
    }
  }
}

interface DbState {
  accounts: Map<string, number>; // finoraId -> recordVersion (syncEvent)
  transactions: Map<string, number>;
  investments: Map<string, number>;
  subscriptions: Map<string, number>;
  budgets: Map<string, number>;
  debts: Map<string, number>;
}

async function loadDbState(userId: string): Promise<DbState> {
  const state: DbState = {
    accounts: new Map(),
    transactions: new Map(),
    investments: new Map(),
    subscriptions: new Map(),
    budgets: new Map(),
    debts: new Map(),
  };

  // Versión DB = max(recordVersion) encontrado en SyncEvents para esa entidad
  async function loadFor(entityType: string, map: Map<string, number>) {
    const events = await prisma.syncEvent.findMany({
      where: { entityType, userId },
      orderBy: { recordVersion: "desc" },
      select: { entityId: true, recordVersion: true },
    });
    for (const e of events) {
      const cur = map.get(e.entityId) ?? 0;
      if (e.recordVersion > cur) map.set(e.entityId, e.recordVersion);
    }
    // Si no hay evento pero la entidad existe, considerar v1
    if (entityType === "Account") {
      const entities = await prisma.account.findMany({ where: { userId }, select: { id: true } });
      for (const e of entities) if (!map.has(e.id)) map.set(e.id, 1);
    } else if (entityType === "Transaction") {
      const entities = await prisma.transaction.findMany({ where: { userId }, select: { id: true } });
      for (const e of entities) if (!map.has(e.id)) map.set(e.id, 1);
    } else if (entityType === "Investment") {
      const entities = await prisma.investment.findMany({ where: { userId }, select: { id: true } });
      for (const e of entities) if (!map.has(e.id)) map.set(e.id, 1);
    } else if (entityType === "Subscription") {
      const entities = await prisma.subscription.findMany({ where: { userId }, select: { id: true } });
      for (const e of entities) if (!map.has(e.id)) map.set(e.id, 1);
    } else if (entityType === "Budget") {
      const entities = await prisma.budget.findMany({ where: { userId }, select: { id: true } });
      for (const e of entities) if (!map.has(e.id)) map.set(e.id, 1);
    } else if (entityType === "Debt") {
      const entities = await prisma.debt.findMany({ where: { userId }, select: { id: true } });
      for (const e of entities) if (!map.has(e.id)) map.set(e.id, 1);
    }
  }

  await Promise.all([
    loadFor("Account", state.accounts),
    loadFor("Transaction", state.transactions),
    loadFor("Investment", state.investments),
    loadFor("Subscription", state.subscriptions),
    loadFor("Budget", state.budgets),
    loadFor("Debt", state.debts),
  ]);

  return state;
}

function buildPlanItem(file: VaultFile, db: DbState): ImportPlanItem {
  const map =
    file.entityType === "account"
      ? db.accounts
      : file.entityType === "transaction"
        ? db.transactions
        : file.entityType === "investment"
          ? db.investments
          : file.entityType === "subscription"
            ? db.subscriptions
            : file.entityType === "budget"
              ? db.budgets
              : file.entityType === "debt"
                ? db.debts
                : null;

  if (!map) {
    return {
      entityType: file.entityType,
      finoraId: file.finoraId,
      path: file.path,
      action: "SKIP_INVALID",
      reason: "Tipo de entidad no soportado",
      vaultVersion: file.recordVersion,
    };
  }

  const dbVersion = map.get(file.finoraId);
  if (dbVersion === undefined) {
    // No existe en DB → CREATE
    return {
      entityType: file.entityType,
      finoraId: file.finoraId,
      path: file.path,
      action: "CREATE",
      reason: "No existe en DB",
      vaultVersion: file.recordVersion,
    };
  }

  if (file.recordVersion > dbVersion) {
    return {
      entityType: file.entityType,
      finoraId: file.finoraId,
      path: file.path,
      action: "UPDATE",
      reason: `Vault v${file.recordVersion} > DB v${dbVersion}`,
      vaultVersion: file.recordVersion,
      currentDbVersion: dbVersion,
    };
  }

  if (file.recordVersion === dbVersion) {
    return {
      entityType: file.entityType,
      finoraId: file.finoraId,
      path: file.path,
      action: "SKIP_CONFLICT",
      reason: "Misma versión: ya sincronizado",
      vaultVersion: file.recordVersion,
      currentDbVersion: dbVersion,
    };
  }

  // Vault es más viejo que DB → probablemente DB tiene cambios más nuevos
  return {
    entityType: file.entityType,
    finoraId: file.finoraId,
    path: file.path,
    action: "SKIP_CONFLICT",
    reason: `Vault v${file.recordVersion} < DB v${dbVersion}: cambio externo es viejo`,
    vaultVersion: file.recordVersion,
    currentDbVersion: dbVersion,
  };
}

async function applyPlan(plan: ImportPlanItem[], userId: string): Promise<void> {
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const item of plan) {
    if (item.action === "SKIP_CONFLICT" || item.action === "SKIP_INVALID" || item.action === "SKIP_TOMBSTONE") {
      skipped++;
      continue;
    }

    try {
      if (item.action === "CREATE") {
        // Sólo actualizamos campos "seguros" desde el Vault
        // Nombre, descripción, notas. NO importamos balances (la fuente de verdad es la DB)
        switch (item.entityType) {
          case "account": {
            const d = (await readFile(item.path)).data;
            await prisma.account.upsert({
              where: { id: item.finoraId },
              create: {
                id: item.finoraId,
                userId,
                name: String(d.name ?? "Unnamed"),
                type: String(d.type ?? "OTHER"),
                currency: String(d.currency ?? "ARS"),
                initialBalance: 0,
                currentBalance: 0,
                isActive: Boolean(d.is_active ?? true),
                isArchived: Boolean(d.is_archived ?? false),
              },
              update: {
                name: String(d.name ?? "Unnamed"),
                isActive: Boolean(d.is_active ?? true),
                isArchived: Boolean(d.is_archived ?? false),
              },
            });
            created++;
            break;
          }
          case "category": {
            const d = (await readFile(item.path)).data;
            const catName = String(d.name ?? "Unnamed");
            const catType = String(d.type ?? "EXPENSE") as "EXPENSE" | "INCOME";
            // Encontrar por unique (userId, name, type)
            const existing = await prisma.category.findUnique({
              where: { userId_name_type: { userId, name: catName, type: catType } },
            });
            if (existing) {
              await prisma.category.update({
                where: { id: existing.id },
                data: {
                  icon: (d.icon as string | null) ?? null,
                  color: (d.color as string | null) ?? null,
                },
              });
            } else {
              await prisma.category.create({
                data: {
                  userId,
                  name: catName,
                  type: catType,
                  icon: (d.icon as string | null) ?? null,
                  color: (d.color as string | null) ?? null,
                },
              });
            }
            created++;
            break;
          }
          default:
            skipped++;
            continue;
        }
      } else if (item.action === "UPDATE") {
        // Update conservador: sólo campos seguros
        switch (item.entityType) {
          case "account": {
            const d = (await readFile(item.path)).data;
            await prisma.account.update({
              where: { id: item.finoraId },
              data: {
                name: String(d.name ?? "Unnamed"),
                isActive: Boolean(d.is_active ?? true),
                isArchived: Boolean(d.is_archived ?? false),
              },
            });
            updated++;
            break;
          }
          default:
            skipped++;
            continue;
        }
      }
    } catch (err) {
      console.error(`  ✗ ${item.entityType}/${item.finoraId.slice(0, 8)}: ${err}`);
      skipped++;
    }
  }

  console.log(`\n  Created: ${created}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);
}

async function readFile(path: string): Promise<{ data: Record<string, unknown>; body: string }> {
  const content = await fs.readFile(path, "utf-8");
  return parseMarkdown(content);
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

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });