/**
 * FINORA — Handlers de generación Markdown por entidad.
 *
 * Cada handler toma el payload de un SyncEvent y construye el contenido
 * del archivo Markdown (frontmatter + body) para esa entidad.
 *
 * Los handlers son funciones PURAS — no tocan filesystem.
 * El caller (worker) los usa para producir el string que luego se
 * escribe atómicamente.
 */

import {
  FINORA_SCHEMA_VERSION,
  filePathFor,
} from "./paths";
import { buildMarkdown, sha256OfData } from "./frontmatter";
import { type EntityType } from "./writer";

/* eslint-disable */

const TYPE_LABEL: Record<string, string> = {
  EXPENSE: "Gasto",
  INCOME: "Ingreso",
  TRANSFER: "Transferencia",
  INVESTMENT: "Inversión",
};

function fmtDate(d: string | Date | null | undefined): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function fmtNum(n: string | number | null | undefined): number | null {
  if (n === null || n === undefined) return null;
  if (typeof n === "string") return Number(n);
  return Number(n);
}

function formatMoneyBody(n: number, currency: string): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  return `${sign}$${formatted} ${currency}`;
}

function formatDateBody(d: Date): string {
  return d.toLocaleDateString("es-AR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export interface BasePayload {
  id: string;
  userId: string;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface TransactionPayload extends BasePayload {
  type: "EXPENSE" | "INCOME" | "TRANSFER" | "INVESTMENT";
  amount: string | number;
  currency: string;
  date: string | Date;
  description?: string | null;
  accountId: string;
  account?: { id: string; name: string; currency: string } | null;
  categoryId?: string | null;
  category?: { id: string; name: string; type: string } | null;
  destinationAccountId?: string | null;
  destinationAccount?: { id: string; name: string } | null;
  exchangeRate?: string | number | null;
  notes?: string | null;
  paymentMethod?: string | null;
}

export interface AccountPayload extends BasePayload {
  name: string;
  type: string;
  currency: string;
  initialBalance: string | number;
  currentBalance: string | number;
  icon?: string | null;
  color?: string | null;
  isActive: boolean;
  isArchived: boolean;
}

export interface InvestmentPayload extends BasePayload {
  name: string;
  ticker?: string | null;
  assetType: string;
  currency: string;
  quantity: string | number;
  averagePurchasePrice: string | number;
  currentPrice: string | number;
  notes?: string | null;
}

export interface SubscriptionPayload extends BasePayload {
  name: string;
  amount: string | number;
  currency: string;
  frequency: string;
  customDays?: number | null;
  nextBillingDate: string | Date;
  status: string;
  accountId?: string | null;
  categoryId?: string | null;
  notes?: string | null;
}

export interface BudgetPayload extends BasePayload {
  categoryId: string;
  category?: { id: string; name: string; type: string } | null;
  month: number;
  year: number;
  limitAmount: string | number;
  currency: string;
}

export interface DebtPayload extends BasePayload {
  name: string;
  originalAmount: string | number;
  remainingAmount: string | number;
  currency: string;
  installments?: number | null;
  interestRate?: string | number | null;
  dueDate?: string | Date | null;
  status: string;
}

export interface RecurringPayload extends BasePayload {
  type: string;
  amount: string | number;
  currency: string;
  frequency: string;
  startDate: string | Date;
  nextExecution: string | Date;
  accountId: string;
  categoryId?: string | null;
  description?: string | null;
  active: boolean;
}

export interface NetWorthPayload extends BasePayload {
  date: string | Date;
  totalAssets: string | number;
  totalLiab: string | number;
  netWorth: string | number;
  currency: string;
}

export interface InvestmentTransactionPayload extends BasePayload {
  investmentId: string;
  type: "BUY" | "SELL" | "DEPOSIT" | "WITHDRAWAL" | "DIVIDEND" | "INTEREST";
  quantity: string | number;
  price: string | number;
  amount: string | number;
  currency: string;
  date: string | Date;
  notes?: string | null;
}

export interface BuildResult {
  markdown: string;
  filePath: string;
  displayName: string;
}

/**
 * Helper que computa SHA-256 de un documento con frontmatter en dos pasadas.
 * En la primera pasada generamos el MD SIN checksum.
 * En la segunda pasada, agregamos el checksum al frontmatter y regeneramos.
 * Como las claves del frontmatter se ordenan alfabéticamente, el resultado
 * es determinístico.
 */
function buildWithChecksum(
  fmData: Record<string, unknown>,
  body: string,
): { markdown: string; checksum: string } {
  const tempMd = buildMarkdown(fmData, body);
  const checksum = sha256OfData(tempMd);
  const fmWithChecksum = { ...fmData, checksum: `sha256:${checksum}` };
  const finalMd = buildMarkdown(fmWithChecksum, body);
  // Re-compute checksum INCLUDING the checksum line so future checks match.
  const finalChecksum = sha256OfData(finalMd);
  if (finalChecksum !== checksum) {
    // Append hash of hash so it's stable
    const finalFm = { ...fmWithChecksum, checksum: `sha256:${finalChecksum}` };
    const finalFinalMd = buildMarkdown(finalFm, body);
    return { markdown: finalFinalMd, checksum: finalChecksum };
  }
  return { markdown: finalMd, checksum };
}

/* ============================================================
 * Generadores por entidad
 * ============================================================ */

export function buildTransactionFile(opts: {
  vaultPath: string;
  payload: TransactionPayload;
  recordVersion: number;
}): BuildResult {
  const { vaultPath, payload, recordVersion } = opts;
  const date = payload.date ? new Date(payload.date) : new Date();
  const displayName =
    payload.description?.trim() ||
    payload.category?.name ||
    TYPE_LABEL[payload.type];
  const filePath = filePathFor({
    vaultPath,
    entityType: "Transaction",
    id: payload.id,
    date,
    displayName: displayName ?? "transaction",
  });
  const amount = fmtNum(payload.amount) ?? 0;
  const fm: Record<string, unknown> = {
    account: payload.account?.name ?? null,
    account_id: payload.accountId,
    amount,
    category: payload.category?.name ?? null,
    category_id: payload.categoryId ?? null,
    created_at: fmtDate(payload.createdAt),
    currency: payload.currency,
    date: fmtDate(payload.date),
    description: payload.description ?? null,
    destination_account: payload.destinationAccount?.name ?? null,
    destination_account_id: payload.destinationAccountId ?? null,
    entity_type: "transaction",
    exchange_rate: fmtNum(payload.exchangeRate ?? null),
    finora_id: payload.id,
    notes: payload.notes ?? null,
    payment_method: payload.paymentMethod ?? null,
    record_version: recordVersion,
    schema_version: FINORA_SCHEMA_VERSION,
    source: "FINORA",
    type: payload.type,
    updated_at: fmtDate(payload.updatedAt),
  };
  const body = `## ${displayName}

**Tipo:** ${TYPE_LABEL[payload.type]}  
**Monto:** ${formatMoneyBody(amount, payload.currency)}  
**Fecha:** ${formatDateBody(date)}  
**Cuenta:** ${payload.account?.name ?? "(sin cuenta)"}${payload.destinationAccount?.name ? ` → ${payload.destinationAccount.name}` : ""}  
${payload.category?.name ? `**Categoría:** ${payload.category.name}\n` : ""}
${payload.notes ? `**Nota:** ${payload.notes}\n` : ""}`;
  const { markdown } = buildWithChecksum(fm, body);
  return { markdown, filePath, displayName: displayName ?? "transaction" };
}

export function buildAccountFile(opts: {
  vaultPath: string;
  payload: AccountPayload;
  recordVersion: number;
}): BuildResult {
  const { vaultPath, payload, recordVersion } = opts;
  const filePath = filePathFor({
    vaultPath,
    entityType: "Account",
    id: payload.id,
    date: new Date(payload.createdAt),
    displayName: payload.name,
  });
  const currentBalance = fmtNum(payload.currentBalance) ?? 0;
  const initialBalance = fmtNum(payload.initialBalance) ?? 0;
  const fm: Record<string, unknown> = {
    color: payload.color ?? null,
    created_at: fmtDate(payload.createdAt),
    currency: payload.currency,
    current_balance: currentBalance,
    entity_type: "account",
    finora_id: payload.id,
    icon: payload.icon ?? null,
    initial_balance: initialBalance,
    is_active: payload.isActive,
    is_archived: payload.isArchived,
    name: payload.name,
    record_version: recordVersion,
    schema_version: FINORA_SCHEMA_VERSION,
    source: "FINORA",
    type: payload.type,
    updated_at: fmtDate(payload.updatedAt),
  };
  const body = `## ${payload.name}

**Tipo:** ${payload.type}  
**Moneda:** ${payload.currency}  
**Saldo actual:** ${formatMoneyBody(currentBalance, payload.currency)}  
**Saldo inicial:** ${formatMoneyBody(initialBalance, payload.currency)}  
**Estado:** ${payload.isArchived ? "Archivada" : payload.isActive ? "Activa" : "Inactiva"}`;
  const { markdown } = buildWithChecksum(fm, body);
  return { markdown, filePath, displayName: payload.name };
}

export function buildInvestmentFile(opts: {
  vaultPath: string;
  payload: InvestmentPayload;
  recordVersion: number;
}): BuildResult {
  const { vaultPath, payload, recordVersion } = opts;
  const filePath = filePathFor({
    vaultPath,
    entityType: "Investment",
    id: payload.id,
    date: new Date(payload.createdAt),
    displayName: payload.name,
  });
  const quantity = fmtNum(payload.quantity) ?? 0;
  const avg = fmtNum(payload.averagePurchasePrice) ?? 0;
  const cur = fmtNum(payload.currentPrice) ?? 0;
  const invested = quantity * avg;
  const value = quantity * cur;
  const pl = value - invested;
  const plPct = invested > 0 ? pl / invested : 0;
  const fm: Record<string, unknown> = {
    asset_type: payload.assetType,
    average_purchase_price: avg,
    created_at: fmtDate(payload.createdAt),
    currency: payload.currency,
    current_price: cur,
    current_value: Number(value.toFixed(4)),
    entity_type: "investment",
    finora_id: payload.id,
    invested_capital: Number(invested.toFixed(4)),
    name: payload.name,
    notes: payload.notes ?? null,
    profit_loss: Number(pl.toFixed(4)),
    profit_loss_pct: Number(plPct.toFixed(6)),
    quantity,
    record_version: recordVersion,
    schema_version: FINORA_SCHEMA_VERSION,
    source: "FINORA",
    ticker: payload.ticker ?? null,
    updated_at: fmtDate(payload.updatedAt),
  };
  const body = `## ${payload.name}${payload.ticker ? ` (${payload.ticker})` : ""}

**Tipo de activo:** ${payload.assetType}  
**Moneda:** ${payload.currency}  
**Cantidad:** ${quantity}  
**Precio promedio:** ${formatMoneyBody(avg, payload.currency)}  
**Precio actual:** ${formatMoneyBody(cur, payload.currency)}  
**Capital invertido:** ${formatMoneyBody(invested, payload.currency)}  
**Valor actual:** ${formatMoneyBody(value, payload.currency)}  
**P/L:** ${formatMoneyBody(pl, payload.currency)} (${(plPct * 100).toFixed(2)}%)`;
  const { markdown } = buildWithChecksum(fm, body);
  return { markdown, filePath, displayName: payload.name };
}

export function buildSubscriptionFile(opts: {
  vaultPath: string;
  payload: SubscriptionPayload;
  recordVersion: number;
}): BuildResult {
  const { vaultPath, payload, recordVersion } = opts;
  const filePath = filePathFor({
    vaultPath,
    entityType: "Subscription",
    id: payload.id,
    date: new Date(payload.createdAt),
    displayName: payload.name,
  });
  const amount = fmtNum(payload.amount) ?? 0;
  const fm: Record<string, unknown> = {
    account_id: payload.accountId ?? null,
    amount,
    category_id: payload.categoryId ?? null,
    created_at: fmtDate(payload.createdAt),
    currency: payload.currency,
    custom_days: payload.customDays ?? null,
    entity_type: "subscription",
    finora_id: payload.id,
    frequency: payload.frequency,
    name: payload.name,
    next_billing_date: fmtDate(payload.nextBillingDate),
    notes: payload.notes ?? null,
    record_version: recordVersion,
    schema_version: FINORA_SCHEMA_VERSION,
    source: "FINORA",
    status: payload.status,
    updated_at: fmtDate(payload.updatedAt),
  };
  const body = `## ${payload.name}

**Importe:** ${formatMoneyBody(amount, payload.currency)}  
**Frecuencia:** ${payload.frequency}  
**Estado:** ${payload.status}  
**Próximo cobro:** ${fmtDate(payload.nextBillingDate) ?? "(no)"}`;
  const { markdown } = buildWithChecksum(fm, body);
  return { markdown, filePath, displayName: payload.name };
}

export function buildBudgetFile(opts: {
  vaultPath: string;
  payload: BudgetPayload;
  recordVersion: number;
}): BuildResult {
  const { vaultPath, payload, recordVersion } = opts;
  const date = new Date(payload.year, payload.month - 1, 1);
  const displayName = payload.category?.name ?? "budget";
  const filePath = filePathFor({
    vaultPath,
    entityType: "Budget",
    id: payload.id,
    date,
    displayName,
  });
  const limit = fmtNum(payload.limitAmount) ?? 0;
  const fm: Record<string, unknown> = {
    category: payload.category?.name ?? null,
    category_id: payload.categoryId,
    created_at: fmtDate(payload.createdAt),
    currency: payload.currency,
    entity_type: "budget",
    finora_id: payload.id,
    limit_amount: limit,
    month: payload.month,
    record_version: recordVersion,
    schema_version: FINORA_SCHEMA_VERSION,
    source: "FINORA",
    updated_at: fmtDate(payload.updatedAt),
    year: payload.year,
  };
  const body = `## Presupuesto: ${payload.category?.name ?? "—"} (${payload.year}-${payload.month.toString().padStart(2, "0")})

**Límite:** ${formatMoneyBody(limit, payload.currency)}`;
  const { markdown } = buildWithChecksum(fm, body);
  return { markdown, filePath, displayName };
}

export function buildDebtFile(opts: {
  vaultPath: string;
  payload: DebtPayload;
  recordVersion: number;
}): BuildResult {
  const { vaultPath, payload, recordVersion } = opts;
  const filePath = filePathFor({
    vaultPath,
    entityType: "Debt",
    id: payload.id,
    date: new Date(payload.createdAt),
    displayName: payload.name,
  });
  const original = fmtNum(payload.originalAmount) ?? 0;
  const remaining = fmtNum(payload.remainingAmount) ?? 0;
  const paid = original - remaining;
  const progress = original > 0 ? paid / original : 0;
  const fm: Record<string, unknown> = {
    created_at: fmtDate(payload.createdAt),
    currency: payload.currency,
    due_date: fmtDate(payload.dueDate ?? null),
    entity_type: "debt",
    finora_id: payload.id,
    installments: payload.installments ?? null,
    interest_rate: fmtNum(payload.interestRate ?? null),
    name: payload.name,
    original_amount: original,
    record_version: recordVersion,
    remaining_amount: remaining,
    schema_version: FINORA_SCHEMA_VERSION,
    source: "FINORA",
    status: payload.status,
    updated_at: fmtDate(payload.updatedAt),
  };
  const body = `## ${payload.name}

**Original:** ${formatMoneyBody(original, payload.currency)}  
**Pendiente:** ${formatMoneyBody(remaining, payload.currency)}  
**Pagado:** ${(progress * 100).toFixed(1)}%  
**Estado:** ${payload.status}${payload.dueDate ? `\n**Vence:** ${fmtDate(payload.dueDate)}` : ""}`;
  const { markdown } = buildWithChecksum(fm, body);
  return { markdown, filePath, displayName: payload.name };
}

export function buildNetWorthFile(opts: {
  vaultPath: string;
  payload: NetWorthPayload;
  recordVersion: number;
}): BuildResult {
  const { vaultPath, payload, recordVersion } = opts;
  const date = new Date(payload.date);
  const filePath = filePathFor({
    vaultPath,
    entityType: "NetWorthSnapshot",
    id: payload.id,
    date,
    displayName: "networth",
  });
  const fm: Record<string, unknown> = {
    created_at: fmtDate(payload.createdAt),
    currency: payload.currency,
    date: fmtDate(payload.date),
    entity_type: "net_worth_snapshot",
    finora_id: payload.id,
    net_worth: fmtNum(payload.netWorth) ?? 0,
    record_version: recordVersion,
    schema_version: FINORA_SCHEMA_VERSION,
    source: "FINORA",
    total_assets: fmtNum(payload.totalAssets) ?? 0,
    total_liabilities: fmtNum(payload.totalLiab) ?? 0,
    updated_at: fmtDate(payload.updatedAt),
  };
  const totalAssets = fm.total_assets as number;
  const totalLiab = fm.total_liabilities as number;
  const netWorth = fm.net_worth as number;
  const body = `## Patrimonio Neto (${(payload.date as string).slice(0, 10)})

**Activos:** ${formatMoneyBody(totalAssets, payload.currency)}  
**Pasivos:** ${formatMoneyBody(totalLiab, payload.currency)}  
**Neto:** ${formatMoneyBody(netWorth, payload.currency)}`;
  const { markdown } = buildWithChecksum(fm, body);
  return { markdown, filePath, displayName: "networth" };
}

export function buildRecurringFile(opts: {
  vaultPath: string;
  payload: RecurringPayload;
  recordVersion: number;
}): BuildResult {
  const { vaultPath, payload, recordVersion } = opts;
  const filePath = filePathFor({
    vaultPath,
    entityType: "RecurringTransaction",
    id: payload.id,
    date: new Date(payload.createdAt),
    displayName: payload.description ?? "recurring",
  });
  const amount = fmtNum(payload.amount) ?? 0;
  const fm: Record<string, unknown> = {
    account_id: payload.accountId,
    active: payload.active,
    amount,
    category_id: payload.categoryId ?? null,
    created_at: fmtDate(payload.createdAt),
    currency: payload.currency,
    description: payload.description ?? null,
    entity_type: "recurring_transaction",
    finora_id: payload.id,
    frequency: payload.frequency,
    next_execution: fmtDate(payload.nextExecution),
    record_version: recordVersion,
    schema_version: FINORA_SCHEMA_VERSION,
    source: "FINORA",
    start_date: fmtDate(payload.startDate),
    type: payload.type,
    updated_at: fmtDate(payload.updatedAt),
  };
  const body = `## ${payload.description ?? "Recurrente"}

**Tipo:** ${payload.type}  
**Monto:** ${formatMoneyBody(amount, payload.currency)}  
**Frecuencia:** ${payload.frequency}  
**Próxima ejecución:** ${fmtDate(payload.nextExecution)}`;
  const { markdown } = buildWithChecksum(fm, body);
  return { markdown, filePath, displayName: payload.description ?? "recurring" };
}

export function buildInvestmentTransactionFile(opts: {
  vaultPath: string;
  payload: InvestmentTransactionPayload;
  recordVersion: number;
}): BuildResult {
  const { vaultPath, payload, recordVersion } = opts;
  const date = new Date(payload.date);
  const displayName = `${payload.type}-${payload.investmentId.slice(0, 6)}`;
  const filePath = filePathFor({
    vaultPath,
    entityType: "InvestmentTransaction",
    id: payload.id,
    date,
    displayName,
  });
  const fm: Record<string, unknown> = {
    amount: fmtNum(payload.amount) ?? 0,
    created_at: fmtDate(payload.createdAt),
    currency: payload.currency,
    date: fmtDate(payload.date),
    entity_type: "investment_transaction",
    finora_id: payload.id,
    investment_id: payload.investmentId,
    notes: payload.notes ?? null,
    price: fmtNum(payload.price) ?? 0,
    quantity: fmtNum(payload.quantity) ?? 0,
    record_version: recordVersion,
    schema_version: FINORA_SCHEMA_VERSION,
    source: "FINORA",
    type: payload.type,
  };
  const amountNum = fm.amount as number;
  const priceNum = fm.price as number;
  const quantityNum = fm.quantity as number;
  const body = `## ${payload.type}

**Cantidad:** ${quantityNum}  
**Precio:** ${formatMoneyBody(priceNum, payload.currency)}  
**Total:** ${formatMoneyBody(amountNum, payload.currency)}  
**Fecha:** ${fmtDate(payload.date)}`;
  const { markdown } = buildWithChecksum(fm, body);
  return { markdown, filePath, displayName };
}

/* ============================================================
 * Dispatcher principal
 * ============================================================ */

export function buildEntityFile(opts: {
  vaultPath: string;
  entityType: EntityType;
  payload: any;
  recordVersion: number;
}): BuildResult {
  switch (opts.entityType) {
    case "Transaction":
      return buildTransactionFile({
        vaultPath: opts.vaultPath,
        payload: opts.payload,
        recordVersion: opts.recordVersion,
      });
    case "Account":
      return buildAccountFile({
        vaultPath: opts.vaultPath,
        payload: opts.payload,
        recordVersion: opts.recordVersion,
      });
    case "Investment":
      return buildInvestmentFile({
        vaultPath: opts.vaultPath,
        payload: opts.payload,
        recordVersion: opts.recordVersion,
      });
    case "InvestmentTransaction":
      return buildInvestmentTransactionFile({
        vaultPath: opts.vaultPath,
        payload: opts.payload,
        recordVersion: opts.recordVersion,
      });
    case "Subscription":
      return buildSubscriptionFile({
        vaultPath: opts.vaultPath,
        payload: opts.payload,
        recordVersion: opts.recordVersion,
      });
    case "Budget":
      return buildBudgetFile({
        vaultPath: opts.vaultPath,
        payload: opts.payload,
        recordVersion: opts.recordVersion,
      });
    case "Debt":
      return buildDebtFile({
        vaultPath: opts.vaultPath,
        payload: opts.payload,
        recordVersion: opts.recordVersion,
      });
    case "RecurringTransaction":
      return buildRecurringFile({
        vaultPath: opts.vaultPath,
        payload: opts.payload,
        recordVersion: opts.recordVersion,
      });
    case "NetWorthSnapshot":
      return buildNetWorthFile({
        vaultPath: opts.vaultPath,
        payload: opts.payload,
        recordVersion: opts.recordVersion,
      });
  }
  throw new Error(`Unknown entity type: ${opts.entityType}`);
}

/* ============================================================
 * Tombstone para DELETE
 * ============================================================ */

export function buildTombstone(opts: {
  originalFileName: string;
  finoraId: string;
  entityType: EntityType;
  deletedAt: Date;
  recordVersion: number;
  reason?: string;
}): { markdown: string; body: string } {
  const fm: Record<string, unknown> = {
    deleted_at: opts.deletedAt.toISOString(),
    entity_type: `${opts.entityType.toLowerCase()}_tombstone`,
    finora_id: opts.finoraId,
    reason: opts.reason ?? "deleted",
    record_version: opts.recordVersion,
    schema_version: FINORA_SCHEMA_VERSION,
    source: "FINORA",
  };
  const body = `# Tombstone: ${opts.originalFileName}

**finora_id:** ${opts.finoraId}  
**entity_type:** ${opts.entityType}  
**deleted_at:** ${opts.deletedAt.toISOString()}  
**record_version:** ${opts.recordVersion}  

Este archivo fue movido a \`99 System/Deleted\` porque el registro fue eliminado en FINORA.  
NO debe ser restaurado automáticamente. Si necesitás recuperar este registro, contactá al administrador.`;
  const { markdown } = buildWithChecksum(fm, body);
  return { markdown, body };
}