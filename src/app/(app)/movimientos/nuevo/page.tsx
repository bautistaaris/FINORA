import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { QuickAddClient } from "./QuickAddClient";

export const dynamic = "force-dynamic";

export default async function QuickAddPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = session.user.id;

  const [accounts, categories, subs, investments] = await Promise.all([
    prisma.account.findMany({
      where: { userId, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.category.findMany({ where: { userId } }),
    prisma.subscription.findMany({ where: { userId } }),
    prisma.investment.findMany({ where: { userId } }),
  ]);

  return (
    <QuickAddClient
      accounts={accounts.map((a) => ({
        id: a.id,
        name: a.name,
        currency: a.currency,
        currentBalance: Number(a.currentBalance),
        type: a.type,
      }))}
      categories={categories.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        icon: c.icon,
      }))}
      subscriptions={subs.map((s) => ({
        id: s.id,
        name: s.name,
        amount: Number(s.amount),
        currency: s.currency,
        frequency: s.frequency,
      }))}
      investments={investments.map((i) => ({
        id: i.id,
        name: i.name,
        ticker: i.ticker,
        assetType: i.assetType,
        currency: i.currency,
      }))}
    />
  );
}