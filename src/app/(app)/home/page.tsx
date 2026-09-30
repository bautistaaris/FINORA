import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  calcMonthlyTotals,
  calcNetWorth,
  formatMoney,
  formatPercent,
  type TxLike,
  type AccountLike,
  type InvestmentLike,
  type DebtLike,
  serializeForClient,
} from "@/lib/finance";
import { DashboardClient } from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = session.user.id;
  const baseCurrency = session.user.baseCurrency || "ARS";

  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  const [accounts, txs, investments, debts, rates, subs, categories] =
    await Promise.all([
      prisma.account.findMany({
        where: { userId, isActive: true, isArchived: false },
        orderBy: { createdAt: "asc" },
      }),
      prisma.transaction.findMany({
        where: { userId },
        orderBy: { date: "desc" },
        take: 365 * 2,
      }),
      prisma.investment.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.debt.findMany({ where: { userId } }),
      prisma.exchangeRate.findMany({
        where: { userId },
        orderBy: { date: "desc" },
        take: 50,
      }),
      prisma.subscription.findMany({
        where: { userId, status: { in: ["ACTIVE", "PAUSED"] } },
        orderBy: { nextBillingDate: "asc" },
      }),
      prisma.category.findMany({ where: { userId } }),
    ]);

  const txLike: TxLike[] = txs.map((t) => ({
    type: t.type as TxLike["type"],
    amount: Number(t.amount),
    currency: t.currency,
    date: t.date,
    accountId: t.accountId,
    destinationAccountId: t.destinationAccountId,
    categoryId: t.categoryId,
  }));

  const monthTxs = txLike.filter(
    (t) => t.date.getMonth() === month && t.date.getFullYear() === year,
  );
  const totals = calcMonthlyTotals(txLike, month, year);

  const spentByCategory = new Map<string, number>();
  for (const tx of monthTxs) {
    if (tx.type === "EXPENSE") {
      const cat = categories.find((c) => c.id === tx.categoryId);
      if (!cat) continue;
      const cur = spentByCategory.get(cat.name) ?? 0;
      spentByCategory.set(cat.name, cur + Math.abs(tx.amount));
    }
  }
  const categoryDistribution = Array.from(spentByCategory.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const netWorth = calcNetWorth(
    accounts as AccountLike[],
    investments as InvestmentLike[],
    debts as DebtLike[],
    baseCurrency,
    rates.map((r) => ({ from: r.from, to: r.to, rate: Number(r.rate) })),
  );

  const weeks: { label: string; income: number; expenses: number }[] = [];
  for (let w = 0; w < 4; w++) {
    const ws = new Date(year, month, 1 + w * 7);
    const we = new Date(year, month, 1 + (w + 1) * 7);
    const inWeek = monthTxs.filter((t) => t.date >= ws && t.date < we);
    const income = inWeek
      .filter((t) => t.type === "INCOME")
      .reduce((acc, t) => acc + t.amount, 0);
    const expenses = inWeek
      .filter((t) => t.type === "EXPENSE" || t.type === "INVESTMENT")
      .reduce((acc, t) => acc + t.amount, 0);
    weeks.push({ label: w === 3 ? "Actual" : `S${w + 1}`, income, expenses });
  }

  const lm = month === 0 ? 11 : month - 1;
  const ly = month === 0 ? year - 1 : year;
  const lastMonthTotals = calcMonthlyTotals(txLike, lm, ly);
  const lastMonthNetWorth =
    netWorth.netWorth - (totals.balance - lastMonthTotals.balance);

  const upcomingBills = subs
    .filter((s) => s.status === "ACTIVE")
    .slice(0, 4)
    .map((s) => ({
      id: s.id,
      name: s.name,
      amount: Number(s.amount),
      currency: s.currency,
      nextBillingDate: s.nextBillingDate.toISOString(),
    }));

  const recentTx = serializeForClient(
    txs.slice(0, 5).map((t) => ({
      id: t.id,
      description: t.description ?? "Movimiento",
      amount: Number(t.amount),
      currency: t.currency,
      type: t.type as "EXPENSE" | "INCOME" | "TRANSFER" | "INVESTMENT",
      date: t.date.toISOString(),
      category: categories.find((c) => c.id === t.categoryId)?.name ?? null,
      account: accounts.find((a) => a.id === t.accountId)?.name ?? null,
    })),
  );

  const data = {
    userName: session.user.name ?? session.user.email ?? "vos",
    baseCurrency,
    privacyDefault: session.user.privacyMode ?? false,
    netWorth: netWorth.netWorth,
    netWorthChange: netWorth.netWorth - lastMonthNetWorth,
    netWorthPct:
      lastMonthNetWorth > 0 ? (netWorth.netWorth - lastMonthNetWorth) / lastMonthNetWorth : 0,
    monthly: {
      income: totals.income,
      expenses: totals.expenses,
      balance: totals.balance,
      savingsRate: totals.savingsRate,
      daysElapsed: now.getDate(),
    },
    weeks,
    categoryDistribution,
    upcomingBills,
    recentTx,
  };

  return (
    <DashboardClient
      data={data}
      recentTx={recentTx}
      formattedNetWorth={formatMoney(data.netWorth, baseCurrency)}
      formattedChange={formatMoney(Math.abs(data.netWorthChange), baseCurrency, { signed: true })}
      formattedIncome={formatMoney(data.monthly.income, baseCurrency)}
      formattedExpenses={formatMoney(data.monthly.expenses, baseCurrency)}
      formattedBalance={formatMoney(data.monthly.balance, baseCurrency, { signed: true })}
      formattedSavingsPct={formatPercent(data.monthly.savingsRate)}
    />
  );
}