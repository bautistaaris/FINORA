import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MovementsClient } from "./MovementsClient";

export const dynamic = "force-dynamic";

export default async function MovementsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = session.user.id;

  const [txs, categories, accounts] = await Promise.all([
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 500,
    }),
    prisma.category.findMany({ where: { userId } }),
    prisma.account.findMany({
      where: { userId, isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const data = txs.map((t) => ({
    id: t.id,
    description: t.description ?? "Movimiento",
    amount: Number(t.amount),
    currency: t.currency,
    type: t.type as "EXPENSE" | "INCOME" | "TRANSFER" | "INVESTMENT",
    date: t.date.toISOString(),
    category: categories.find((c) => c.id === t.categoryId)?.name ?? null,
    account: accounts.find((a) => a.id === t.accountId)?.name ?? null,
    categoryId: t.categoryId,
    accountId: t.accountId,
  }));

  const accountList = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
  }));

  return <MovementsClient initial={data} accounts={accountList} />;
}