/**
 * FINORA — Generadores de reportes agregados para el Vault.
 *
 * Estos archivos se generan a partir de la DB y se escriben como Markdown:
 *
 *   FINORA/00 Dashboard/FINORA Dashboard.md     ← resumen actual (live)
 *   FINORA/09 Reports/Monthly/YYYY-MM.md       ← resumen mensual (snapshot)
 *
 * Reglas:
 *  - El dashboard es LIVE: se regenera en cada sync o por cron
 *  - El reporte mensual es snapshot del momento de generación
 *  - Los links Obsidian son sólo para navegación visual, no afectan IDs
 *  - La estructura del archivo sigue el mismo formato frontmatter
 */

import { Prisma } from "@prisma/client";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  atomicWrite,
  ensureDir,
  fileExists,
  moveToDeleted,
} from "./writer";
import {
  buildMarkdown,
  sha256OfData,
} from "./frontmatter";
import {
  FINORA_SCHEMA_VERSION,
  finoraRoot,
} from "./paths";
import {
  type TxLike,
  type AccountLike,
  type InvestmentLike,
  type DebtLike,
  calcMonthlyTotals,
  calcNetWorth,
  calcSubscriptionMonthlyCost,
} from "@/lib/finance";

const REPORT_VERSION = 1;

interface DashboardData {
  baseCurrency: string;
  netWorth: number;
  netWorthChange: number;
  monthly: { income: number; expenses: number; balance: number; savingsRate: number };
  accounts: Array<{ name: string; balance: number; currency: string }>;
  investments: Array<{ name: string; value: number; pl: number; currency: string }>;
  upcomingBills: Array<{ name: string; amount: number; currency: string; nextDate: Date }>;
  recentTx: Array<{ description: string; amount: number; currency: string; type: string; date: Date }>;
  topCategories: Array<{ name: string; amount: number }>;
}

/**
 * Genera el archivo del dashboard en ${VAULT}/FINORA/00 Dashboard/FINORA Dashboard.md
 */
export async function generateDashboard(
  vaultPath: string,
  userId: string,
): Promise<{ path: string; bytes: number }> {
  const data = await loadDashboardData(vaultPath, userId);
  const dir = path.join(finoraRoot(vaultPath), "00 Dashboard");
  await ensureDir(dir);

  // Si existe un dashboard previo, archivarlo primero
  const target = path.join(dir, "FINORA Dashboard.md");
  if (await fileExists(target)) {
    const archived = path.join(finoraRoot(vaultPath), "99 System", "Deleted", new Date().toISOString().slice(0, 10));
    await ensureDir(archived);
    await moveToDeleted(target, archived);
  }

  const body = buildDashboardBody(data);
  const fm = {
    entity_type: "dashboard",
    finora_id: "dashboard",
    generated_at: new Date().toISOString(),
    base_currency: data.baseCurrency,
    report_version: REPORT_VERSION,
    schema_version: FINORA_SCHEMA_VERSION,
    source: "FINORA",
  };
  const tempMd = buildMarkdown(fm, body);
  const checksum = sha256OfData(tempMd);
  const fmWithChecksum = { ...fm, checksum: `sha256:${checksum}` };
  const finalMd = buildMarkdown(fmWithChecksum, body);

  const result = await atomicWrite(target, finalMd);
  return { path: target, bytes: result.bytes };
}

/**
 * Genera el reporte mensual: ${VAULT}/FINORA/09 Reports/Monthly/YYYY-MM.md
 */
export async function generateMonthlyReport(
  vaultPath: string,
  userId: string,
  month: number,
  year: number,
): Promise<{ path: string; bytes: number }> {
  const data = await loadMonthlyData(userId, month, year);
  const dir = path.join(finoraRoot(vaultPath), "09 Reports", "Monthly");
  await ensureDir(dir);

  const mm = month.toString().padStart(2, "0");
  const fileName = `${year}-${mm}.md`;
  const target = path.join(dir, fileName);

  // Si existe, archivar
  if (await fileExists(target)) {
    const archived = path.join(finoraRoot(vaultPath), "99 System", "Deleted", new Date().toISOString().slice(0, 10));
    await ensureDir(archived);
    await moveToDeleted(target, archived);
  }

  const body = buildMonthlyBody(data, month, year);
  const fm = {
    entity_type: "monthly_report",
    finora_id: `${year}-${mm}`,
    generated_at: new Date().toISOString(),
    month,
    year,
    base_currency: data.baseCurrency,
    report_version: REPORT_VERSION,
    schema_version: FINORA_SCHEMA_VERSION,
    source: "FINORA",
  };
  const tempMd = buildMarkdown(fm, body);
  const checksum = sha256OfData(tempMd);
  const fmWithChecksum = { ...fm, checksum: `sha256:${checksum}` };
  const finalMd = buildMarkdown(fmWithChecksum, body);

  const result = await atomicWrite(target, finalMd);
  return { path: target, bytes: result.bytes };
}

// =========================================================
// Data loaders
// =========================================================

async function loadDashboardData(vaultPath: string, userId: string): Promise<DashboardData> {
  // Lazy import Prisma to avoid loading it in contexts where it isn't needed
  const { prisma } = await import("@/lib/db");
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  const [user, accounts, txs, investments, debts, rates, subs, categories] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { baseCurrency: true } }),
    prisma.account.findMany({ where: { userId, isActive: true, isArchived: false } }),
    prisma.transaction.findMany({ where: { userId }, orderBy: { date: "desc" }, take: 200 }),
    prisma.investment.findMany({ where: { userId } }),
    prisma.debt.findMany({ where: { userId } }),
    prisma.exchangeRate.findMany({ where: { userId }, orderBy: { date: "desc" }, take: 10 }),
    prisma.subscription.findMany({ where: { userId, status: { in: ["ACTIVE", "PAUSED"] } } }),
    prisma.category.findMany({ where: { userId } }),
  ]);

  const baseCurrency = user?.baseCurrency ?? "ARS";
  const txLike: TxLike[] = txs.map((t) => ({
    type: t.type as TxLike["type"],
    amount: Number(t.amount),
    currency: t.currency,
    date: t.date,
  }));
  const monthly = calcMonthlyTotals(txLike, month, year);

  const netWorth = calcNetWorth(
    accounts as unknown as AccountLike[],
    investments as unknown as InvestmentLike[],
    debts as unknown as DebtLike[],
    baseCurrency,
    rates.map((r) => ({ from: r.from, to: r.to, rate: Number(r.rate) })),
  );

  const accountsView = accounts.map((a) => ({
    name: a.name,
    balance: Number(a.currentBalance),
    currency: a.currency,
  }));

  const investmentsView = investments.map((i) => {
    const q = Number(i.quantity);
    const cur = Number(i.currentPrice);
    const avg = Number(i.averagePurchasePrice);
    const value = q * cur;
    const invested = q * avg;
    return {
      name: i.ticker ?? i.name,
      value,
      pl: value - invested,
      currency: i.currency,
    };
  });

  const upcomingBills = subs
    .filter((s) => s.status === "ACTIVE")
    .slice(0, 5)
    .map((s) => ({
      name: s.name,
      amount: Number(s.amount),
      currency: s.currency,
      nextDate: s.nextBillingDate,
    }));

  const recentTx = txs.slice(0, 5).map((t) => ({
    description: t.description ?? "M",
    amount: Number(t.amount),
    currency: t.currency,
    type: t.type,
    date: t.date,
  }));

  // Top categorías del mes
  const spentByCategory = new Map<string, number>();
  for (const tx of txLike) {
    if (tx.type === "EXPENSE") {
      const cat = categories.find((c) => c.id === (tx as TxLike & { categoryId?: string }).categoryId);
      if (cat) {
        const cur = spentByCategory.get(cat.name) ?? 0;
        spentByCategory.set(cat.name, cur + Math.abs(tx.amount));
      }
    }
  }
  const topCategories = Array.from(spentByCategory.entries())
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  // Compute change vs last month
  const lm = month === 0 ? 11 : month - 1;
  const ly = month === 0 ? year - 1 : year;
  const lastMonth = calcMonthlyTotals(txLike, lm, ly);
  const netWorthChange = monthly.balance - lastMonth.balance;

  return {
    baseCurrency,
    netWorth: netWorth.netWorth,
    netWorthChange,
    monthly: {
      income: monthly.income,
      expenses: monthly.expenses,
      balance: monthly.balance,
      savingsRate: monthly.savingsRate,
    },
    accounts: accountsView,
    investments: investmentsView,
    upcomingBills,
    recentTx,
    topCategories,
  };
}

interface MonthlyData {
  baseCurrency: string;
  totals: { income: number; expenses: number; balance: number; savingsRate: number };
  byCategory: Array<{ name: string; amount: number; pct: number }>;
  subscriptions: Array<{
    name: string;
    amount: number;
    currency: string;
    frequency: string;
    monthlyEquivalent: number;
  }>;
  investments: Array<{ name: string; pl: number; plPct: number; currency: string }>;
  transactionsCount: number;
  netWorth: number;
}

async function loadMonthlyData(userId: string, month: number, year: number): Promise<MonthlyData> {
  const { prisma } = await import("@/lib/db");

  const [user, txs, categories, subs, investments, accounts, debts, rates] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { baseCurrency: true } }),
    prisma.transaction.findMany({
      where: {
        userId,
        date: {
          gte: new Date(year, month, 1),
          lt: new Date(year, month + 1, 1),
        },
      },
    }),
    prisma.category.findMany({ where: { userId } }),
    prisma.subscription.findMany({ where: { userId, status: "ACTIVE" } }),
    prisma.investment.findMany({ where: { userId } }),
    prisma.account.findMany({ where: { userId, isActive: true, isArchived: false } }),
    prisma.debt.findMany({ where: { userId } }),
    prisma.exchangeRate.findMany({ where: { userId }, orderBy: { date: "desc" }, take: 10 }),
  ]);

  const baseCurrency = user?.baseCurrency ?? "ARS";

  const txLike: TxLike[] = txs.map((t) => ({
    type: t.type as TxLike["type"],
    amount: Number(t.amount),
    currency: t.currency,
    date: t.date,
  }));
  const totals = calcMonthlyTotals(txLike, month, year);

  const byCategory = new Map<string, number>();
  for (const tx of txLike) {
    if (tx.type === "EXPENSE") {
      const cat = categories.find((c) => c.id === (tx as TxLike & { categoryId?: string }).categoryId);
      if (cat) {
        const cur = byCategory.get(cat.name) ?? 0;
        byCategory.set(cat.name, cur + Math.abs(tx.amount));
      }
    }
  }
  const totalExpenses = totals.expenses;
  const byCategoryView = Array.from(byCategory.entries())
    .map(([name, amount]) => ({
      name,
      amount,
      pct: totalExpenses > 0 ? amount / totalExpenses : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const subsView = subs.map((s) => ({
    name: s.name,
    amount: Number(s.amount),
    currency: s.currency,
    frequency: s.frequency,
    monthlyEquivalent: calcSubscriptionMonthlyCost(
      Number(s.amount),
      s.frequency as "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM",
      s.customDays,
    ),
  }));

  const invView = investments.map((i) => {
    const q = Number(i.quantity);
    const cur = Number(i.currentPrice);
    const avg = Number(i.averagePurchasePrice);
    const value = q * cur;
    const invested = q * avg;
    const pl = value - invested;
    return {
      name: i.ticker ?? i.name,
      pl,
      plPct: invested > 0 ? pl / invested : 0,
      currency: i.currency,
    };
  });

  const netWorth = calcNetWorth(
    accounts as unknown as AccountLike[],
    investments as unknown as InvestmentLike[],
    debts as unknown as DebtLike[],
    baseCurrency,
    rates.map((r) => ({ from: r.from, to: r.to, rate: Number(r.rate) })),
  );

  return {
    baseCurrency,
    totals,
    byCategory: byCategoryView,
    subscriptions: subsView,
    investments: invView,
    transactionsCount: txs.length,
    netWorth: netWorth.netWorth,
  };
}

// =========================================================
// Markdown body builders
// =========================================================

function buildDashboardBody(d: DashboardData): string {
  const fmt = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  const fmtSigned = (n: number) => (n >= 0 ? "+" : "") + fmt(n);

  const accTable = d.accounts.length === 0
    ? "_Sin cuentas registradas_"
    : d.accounts
        .map(
          (a) =>
            `| ${a.name} | ${a.currency} | ${fmt(a.balance)} | [[FINORA/02 Accounts/${a.name}]] |`,
        )
        .join("\n");

  const invTable = d.investments.length === 0
    ? "_Sin posiciones_"
    : d.investments
        .map(
          (i) =>
            `| ${i.name} | ${i.currency} | ${fmt(i.value)} | ${fmtSigned(i.pl)} |`,
        )
        .join("\n");

  const billsTable = d.upcomingBills.length === 0
    ? "_Sin próximas suscripciones_"
    : d.upcomingBills
        .map(
          (b) =>
            `| ${b.name} | ${b.currency} ${fmt(b.amount)} | ${b.nextDate.toISOString().slice(0, 10)} |`,
        )
        .join("\n");

  const txTable = d.recentTx.length === 0
    ? "_Sin movimientos recientes_"
    : d.recentTx
        .map(
          (t) =>
            `| ${t.date.toISOString().slice(0, 10)} | ${t.description} | ${t.currency} ${fmt(t.amount)} | ${t.type} |`,
        )
        .join("\n");

  const catsTable = d.topCategories.length === 0
    ? "_Sin gastos en el mes_"
    : d.topCategories.map((c) => `- **${c.name}**: ${fmt(c.amount)} ${d.baseCurrency}`).join("\n");

  return `# FINORA Dashboard

> Dashboard generado automáticamente. La información está basada en la DB al momento de generación.
> Para ver datos en vivo, usar [FINORA](https://finora.tudominio.com).

---

## Patrimonio total

**${fmt(d.netWorth)} ${d.baseCurrency}**
_(cambio mensual: ${fmtSigned(d.netWorthChange)} ${d.baseCurrency})_

## Resumen del mes

| Concepto | | Importe |
|---|---|---|
| Ingresos | | ${fmt(d.monthly.income)} ${d.baseCurrency} |
| Gastos | | ${fmt(d.monthly.expenses)} ${d.baseCurrency} |
| Balance neto | | ${fmtSigned(d.monthly.balance)} ${d.baseCurrency} |
| Tasa de ahorro | | ${(d.monthly.savingsRate * 100).toFixed(1)}% |

## Top categorías

${catsTable}

## Cuentas

| Nombre | Moneda | Saldo | Link |
|---|---|---|---|
${accTable}

## Inversiones

| Nombre | Moneda | Valor actual | P/L |
|---|---|---|---|
${invTable}

## Próximas suscripciones

| Nombre | Importe | Fecha |
|---|---|---|
${billsTable}

## Últimos movimientos

| Fecha | Descripción | | Tipo |
|---|---|---|---|
${txTable}

---

## Secciones

- [[FINORA/01 Transactions]]
- [[FINORA/02 Accounts]]
- [[FINORA/03 Investments]]
- [[FINORA/04 Subscriptions]]
- [[FINORA/05 Budgets]]
- [[FINORA/06 Debts]]
- [[FINORA/08 Net Worth]]
- [[FINORA/09 Reports/Monthly]]

## Cómo usar este dashboard

Este dashboard es **legible sin plugins de Obsidian** (Dataview, Templater, etc).
Toda la información esencial está inline.

Para datos en tiempo real, usar la app web.
Para cambios manuales en el Vault → FINORA, usar **Importar cambios desde Obsidian** en la app.

**Importante**: si FINORA y este dashboard difieren, la fuente de verdad es la DB.
Este archivo es un snapshot human-readable del estado al momento de generación.
`;
}

function buildMonthlyBody(d: MonthlyData, month: number, year: number): string {
  const fmt = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
  const fmtSigned = (n: number) => (n >= 0 ? "+" : "") + fmt(n);

  const monthLabel = new Date(year, month - 1, 1).toLocaleString("es-AR", { month: "long", year: "numeric" });

  const catsTable = d.byCategory.length === 0
    ? "_Sin gastos en el mes_"
    : d.byCategory
        .map(
          (c) =>
            `| ${c.name} | ${fmt(c.amount)} ${d.baseCurrency} | ${(c.pct * 100).toFixed(1)}% |`,
        )
        .join("\n");

  const subsTable = d.subscriptions.length === 0
    ? "_Sin suscripciones activas_"
    : d.subscriptions
        .map(
          (s) =>
            `| ${s.name} | ${s.currency} ${fmt(s.amount)} | ${s.frequency} | ${fmt(s.monthlyEquivalent)} ${s.currency}/mes |`,
        )
        .join("\n");

  const invTable = d.investments.length === 0
    ? "_Sin inversiones_"
    : d.investments
        .map(
          (i) =>
            `| ${i.name} | ${i.currency} | ${fmtSigned(i.pl)} | ${(i.plPct * 100).toFixed(2)}% |`,
        )
        .join("\n");

  return `# Reporte mensual — ${monthLabel}

> Snapshot automático. Generado el ${new Date().toISOString().slice(0, 10)}.
> Para datos en vivo: [FINORA](https://finora.tudominio.com).

---

## Resumen

| Concepto | Importe |
|---|---|
| Ingresos | ${fmt(d.totals.income)} ${d.baseCurrency} |
| Gastos | ${fmt(d.totals.expenses)} ${d.baseCurrency} |
| Balance | ${fmtSigned(d.totals.balance)} ${d.baseCurrency} |
| Tasa de ahorro | ${(d.totals.savingsRate * 100).toFixed(1)}% |
| Patrimonio total | ${fmt(d.netWorth)} ${d.baseCurrency} |
| Movimientos del mes | ${d.transactionsCount} |

## Gastos por categoría

| Categoría | Importe | % del gasto |
|---|---|---|
${catsTable}

## Suscripciones activas

| Nombre | Importe | Frecuencia | Costo mensual equivalente |
|---|---|---|---|
${subsTable}

## Inversiones (P/L actual)

| Nombre | Moneda | P/L | % |
|---|---|---|---|
${invTable}

---

## Links a secciones

- [[FINORA/01 Transactions]]
- [[FINORA/02 Accounts]]
- [[FINORA/03 Investments]]
- [[FINORA/04 Subscriptions]]
- [[FINORA/05 Budgets]]
- [[FINORA/06 Debts]]
- [[FINORA/00 Dashboard/FINORA Dashboard]]
`;
}