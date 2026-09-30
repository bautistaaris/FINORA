import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { calcBudgetProgress } from "@/lib/finance";
import { BudgetsClient } from "./BudgetsClient";

export const dynamic = "force-dynamic";

export default async function BudgetsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = session.user.id;
  const baseCurrency = session.user.baseCurrency;
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();

  const [budgets, categories, txs] = await Promise.all([
    prisma.budget.findMany({
      where: { userId, month, year },
    }),
    prisma.category.findMany({ where: { userId } }),
    prisma.transaction.findMany({
      where: {
        userId,
        type: "EXPENSE",
        date: {
          gte: new Date(year, month, 1),
          lt: new Date(year, month + 1, 1),
        },
      },
    }),
  ]);

  const data = budgets.map((b) => {
    const cat = categories.find((c) => c.id === b.categoryId);
    const spent = txs
      .filter((t) => t.categoryId === b.categoryId)
      .reduce((acc, t) => acc + Number(t.amount), 0);
    const progress = calcBudgetProgress(spent, Number(b.limitAmount));
    return {
      id: b.id,
      categoryId: b.categoryId,
      categoryName: cat?.name ?? "—",
      icon: cat?.icon ?? "category",
      limit: progress.limit,
      spent: progress.spent,
      remaining: progress.remaining,
      percentage: progress.percentage,
      currency: b.currency,
    };
  });

  return <BudgetsClient budgets={data} baseCurrency={baseCurrency} month={month + 1} year={year} />;
}