import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "json";
  const userId = session.user.id;

  const [accounts, txs, categories, investments, subs, budgets, debts, rates] =
    await Promise.all([
      prisma.account.findMany({ where: { userId } }),
      prisma.transaction.findMany({ where: { userId }, orderBy: { date: "desc" } }),
      prisma.category.findMany({ where: { userId } }),
      prisma.investment.findMany({ where: { userId } }),
      prisma.subscription.findMany({ where: { userId } }),
      prisma.budget.findMany({ where: { userId } }),
      prisma.debt.findMany({ where: { userId } }),
      prisma.exchangeRate.findMany({ where: { userId } }),
    ]);

  if (format === "csv") {
    const header = [
      "id",
      "type",
      "amount",
      "currency",
      "description",
      "date",
      "category",
      "account",
    ].join(",");
    const lines = txs.map((t) =>
      [
        t.id,
        t.type,
        Number(t.amount).toFixed(4),
        t.currency,
        `"${(t.description ?? "").replace(/"/g, "\"\"")}"`,
        t.date.toISOString(),
        categories.find((c) => c.id === t.categoryId)?.name ?? "",
        accounts.find((a) => a.id === t.accountId)?.name ?? "",
      ].join(","),
    );
    const csv = [header, ...lines].join("\n");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="finora-transacciones-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const payload = {
    exportedAt: new Date().toISOString(),
    accounts: accounts.map((a) => ({
      ...a,
      initialBalance: Number(a.initialBalance),
      currentBalance: Number(a.currentBalance),
    })),
    transactions: txs.map((t) => ({
      ...t,
      amount: Number(t.amount),
      exchangeRate: t.exchangeRate !== null ? Number(t.exchangeRate) : null,
    })),
    categories,
    investments: investments.map((i) => ({
      ...i,
      quantity: Number(i.quantity),
      averagePurchasePrice: Number(i.averagePurchasePrice),
      currentPrice: Number(i.currentPrice),
    })),
    subscriptions: subs.map((s) => ({
      ...s,
      amount: Number(s.amount),
    })),
    budgets: budgets.map((b) => ({
      ...b,
      limitAmount: Number(b.limitAmount),
    })),
    debts: debts.map((d) => ({
      ...d,
      originalAmount: Number(d.originalAmount),
      remainingAmount: Number(d.remainingAmount),
      interestRate: d.interestRate !== null ? Number(d.interestRate) : null,
    })),
    exchangeRates: rates.map((r) => ({ ...r, rate: Number(r.rate) })),
  };
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="finora-backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}