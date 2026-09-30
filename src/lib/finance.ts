/**
 * FINORA — Motor de cálculos financieros
 *
 * Toda la lógica crítica vive acá. NO mezcla UI ni DB.
 * Recibe datos planos, devuelve datos planos. Pura y testeable.
 *
 * === Decisión sobre precisión ===
 * Todos los importes monetarios se almacenan como `Decimal(18, 4)` en PostgreSQL.
 * En código se wrappean en `Prisma.Decimal` (decimal.js) para aritmética exacta.
 *
 * Para minimizar overhead en UI/JSON, este módulo:
 *  - Acepta inputs como `number | string | Decimal` (tipo MoneyInput)
 *  - Trabaja internamente con `Prisma.Decimal`
 *  - Devuelve `number` (vía `.toNumber()` con redondeo) en los puntos de salida
 *
 * Esto mantiene la API de las páginas simple (siguen tratando todo como number)
 * mientras garantiza exactitud en sumsas, multiplicaciones y conversiones.
 *
 * Convenciones:
 *  - Todos los importes son positivos.
 *  - El signo (positivo/negativo) lo decide el `type` (EXPENSE/INCOME/TRANSFER/INVESTMENT).
 *  - Las conversiones de moneda se hacen antes de cualquier suma entre monedas.
 *  - Las sumas se hacen con Decimal para evitar drift de floating point.
 */

import { Prisma } from "@prisma/client";

export type TxType = "EXPENSE" | "INCOME" | "TRANSFER" | "INVESTMENT";

export type MoneyInput = number | string | Prisma.Decimal;

/** Helper para crear Decimal desde cualquier input. */
function D(x: MoneyInput | null | undefined): Prisma.Decimal {
  if (x === null || x === undefined) return new Prisma.Decimal(0);
  if (x instanceof Prisma.Decimal) return x;
  return new Prisma.Decimal(x);
}

/** Helper para convertir Decimal → number redondeado a N decimales. */
function n(d: Prisma.Decimal, fractionDigits = 4): number {
  return Number(d.toFixed(fractionDigits));
}

export interface TxLike {
  type: TxType;
  amount: number;
  currency: string;
  date: Date;
  accountId?: string;
  destinationAccountId?: string | null;
  categoryId?: string | null;
}

export interface MonthlyTotals {
  income: number;
  expenses: number;
  balance: number;
  savingsRate: number;
}

export interface NetWorthBreakdown {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  currency: string;
}

// =========================================================
// Helpers de conversión de moneda
// =========================================================

export function resolveRate(
  rates: Array<{ from: string; to: string; rate: MoneyInput }>,
  from: string,
  to: string,
): Prisma.Decimal {
  if (from === to) return new Prisma.Decimal(1);
  const direct = rates.find((r) => r.from === from && r.to === to);
  if (direct) return D(direct.rate);
  const inverse = rates.find((r) => r.from === to && r.to === from);
  if (inverse) {
    const r = D(inverse.rate);
    if (r.gt(0)) return new Prisma.Decimal(1).dividedBy(r);
  }
  return new Prisma.Decimal(1);
}

export function convertAmount(
  amount: MoneyInput,
  from: string,
  to: string,
  rates: Array<{ from: string; to: string; rate: MoneyInput }>,
): Prisma.Decimal {
  if (from === to) return D(amount);
  return D(amount).times(resolveRate(rates, from, to));
}

// =========================================================
// Cálculos mensuales
// =========================================================

export function filterByMonth(txs: TxLike[], month: number, year: number): TxLike[] {
  return txs.filter((tx) => {
    const d = tx.date;
    return d.getMonth() === month && d.getFullYear() === year;
  });
}

export function calcMonthlyTotals(
  txs: TxLike[],
  month: number,
  year: number,
): MonthlyTotals {
  const monthTxs = filterByMonth(txs, month, year);
  let income = new Prisma.Decimal(0);
  let expenses = new Prisma.Decimal(0);

  for (const tx of monthTxs) {
    const amt = D(tx.amount).abs();
    if (tx.type === "INCOME") {
      income = income.plus(amt);
    } else if (tx.type === "EXPENSE" || tx.type === "INVESTMENT") {
      expenses = expenses.plus(amt);
    }
    // TRANSFER se ignora: no afecta cash flow global.
  }

  const balance = income.minus(expenses);
  const savingsRate = income.gt(0) ? balance.dividedBy(income).toNumber() : 0;

  return {
    income: n(income),
    expenses: n(expenses),
    balance: n(balance),
    savingsRate,
  };
}

// =========================================================
// Patrimonio neto
// =========================================================

export interface AccountLike {
  currency: string;
  currentBalance: MoneyInput;
}

export interface InvestmentLike {
  currency: string;
  quantity: MoneyInput;
  currentPrice: MoneyInput;
}

export interface DebtLike {
  currency: string;
  remainingAmount: MoneyInput;
  status: string;
}

export function calcNetWorth(
  accounts: AccountLike[],
  investments: InvestmentLike[],
  debts: DebtLike[],
  baseCurrency: string,
  rates: Array<{ from: string; to: string; rate: MoneyInput }>,
): NetWorthBreakdown {
  const sumAssets = (arr: (AccountLike | InvestmentLike)[]) =>
    arr.reduce<Prisma.Decimal>((acc, item) => {
      const value =
        "currentBalance" in item
          ? D(item.currentBalance)
          : D(item.quantity).times(D(item.currentPrice));
      return acc.plus(convertAmount(value, item.currency, baseCurrency, rates));
    }, new Prisma.Decimal(0));

  const sumDebts = debts
    .filter((d) => d.status === "ACTIVE")
    .reduce<Prisma.Decimal>(
      (acc, d) =>
        acc.plus(
          convertAmount(d.remainingAmount, d.currency, baseCurrency, rates),
        ),
      new Prisma.Decimal(0),
    );

  const totalAssets = sumAssets(accounts).plus(sumAssets(investments));
  const totalLiabilities = sumDebts;
  const netWorth = totalAssets.minus(totalLiabilities);
  return {
    totalAssets: n(totalAssets),
    totalLiabilities: n(totalLiabilities),
    netWorth: n(netWorth),
    currency: baseCurrency,
  };
}

// =========================================================
// Inversión P/L
// =========================================================

export interface PositionInputs {
  quantity: MoneyInput;
  averagePurchasePrice: MoneyInput;
  currentPrice: MoneyInput;
}

export function calcPositionPL(pos: PositionInputs): {
  investedCapital: number;
  currentValue: number;
  profitLoss: number;
  profitLossPct: number;
} {
  const q = D(pos.quantity);
  const invested = q.times(D(pos.averagePurchasePrice));
  const current = q.times(D(pos.currentPrice));
  const pl = current.minus(invested);
  const plPct = invested.gt(0) ? pl.dividedBy(invested).toNumber() : 0;
  return {
    investedCapital: n(invested),
    currentValue: n(current),
    profitLoss: n(pl),
    profitLossPct: plPct,
  };
}

// =========================================================
// Transferencias
// =========================================================

export interface TransferInputs {
  amount: MoneyInput;
  sourceCurrency: string;
  destCurrency: string;
  exchangeRate?: MoneyInput | null;
}

export function calcTransferSplit(input: TransferInputs): {
  amountDeducted: Prisma.Decimal;
  amountAdded: Prisma.Decimal;
} {
  const amt = D(input.amount);
  if (input.sourceCurrency === input.destCurrency || !input.exchangeRate) {
    return { amountDeducted: amt, amountAdded: amt };
  }
  return { amountDeducted: amt, amountAdded: amt.times(D(input.exchangeRate)) };
}

// =========================================================
// Suscripciones
// =========================================================

export type SubFrequency = "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM";

export function calcSubscriptionMonthlyCost(
  amount: MoneyInput,
  frequency: SubFrequency,
  customDays?: number | null,
): number {
  const amt = D(amount);
  switch (frequency) {
    case "WEEKLY":
      return n(amt.times(52).dividedBy(12));
    case "MONTHLY":
      return n(amt);
    case "QUARTERLY":
      return n(amt.dividedBy(3));
    case "YEARLY":
      return n(amt.dividedBy(12));
    case "CUSTOM":
      if (customDays && customDays > 0)
        return n(amt.times(30).dividedBy(customDays));
      return n(amt);
    default:
      return n(amt);
  }
}

export function calcSubscriptionAnnualCost(
  amount: MoneyInput,
  frequency: SubFrequency,
  customDays?: number | null,
): number {
  return calcSubscriptionMonthlyCost(amount, frequency, customDays) * 12;
}

// =========================================================
// Presupuestos
// =========================================================

export function calcBudgetProgress(
  spent: MoneyInput,
  limit: MoneyInput,
): {
  spent: number;
  limit: number;
  remaining: number;
  percentage: number;
} {
  const lim = D(limit);
  const sp = D(spent);
  const safeLimit = lim.gt(0) ? lim : new Prisma.Decimal(0);
  const remaining = Prisma.Decimal.max(safeLimit.minus(sp), new Prisma.Decimal(0));
  const percentage =
    safeLimit.gt(0)
      ? Math.min(sp.dividedBy(safeLimit).toNumber(), 1)
      : 0;
  return {
    spent: n(sp),
    limit: n(safeLimit),
    remaining: n(remaining),
    percentage,
  };
}

// =========================================================
// Formateo (locale-aware, no toca DB)
// =========================================================

const CURRENCY_LOCALES: Record<string, string> = {
  ARS: "es-AR",
  USD: "en-US",
  EUR: "de-DE",
};

export function formatMoney(
  value: number,
  currency: string = "ARS",
  options?: { showSymbol?: boolean; signed?: boolean },
): string {
  const { showSymbol = true, signed = false } = options ?? {};
  const locale = CURRENCY_LOCALES[currency] ?? "en-US";
  const formatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    signDisplay: signed ? "exceptZero" : "auto",
  });
  const formatted = formatter.format(value);
  if (!showSymbol) return formatted;
  return currency === "USD" ? `US$ ${formatted}` : `$ ${formatted}`;
}

export function formatMoneyShort(value: number, currency: string = "ARS"): string {
  if (Math.abs(value) >= 1_000_000) {
    return `${formatMoney(value / 1_000_000, currency, { showSymbol: false })}M`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${formatMoney(value / 1_000, currency, { showSymbol: false })}K`;
  }
  return formatMoney(value, currency, { showSymbol: false });
}

export function formatPercent(value: number, fractionDigits = 1): string {
  return `${(value * 100).toFixed(fractionDigits)}%`;
}

/**
 * Helper de para serializar objetos Prisma antes de pasarlos a Client Components.
 * Convierte Prisma.Decimal → number (con redondeo a 4 decimales).
 * Aplana Date → ISO string.
 * Útil en server components para evitar problemas de RSC serialization.
 */
export function serializeForClient<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (v instanceof Prisma.Decimal) return Number(v.toFixed(4));
      return v;
    }),
  );
}