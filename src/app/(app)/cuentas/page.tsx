import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { convertAmount, serializeForClient } from "@/lib/finance";
import { AccountsClient } from "./AccountsClient";

export const dynamic = "force-dynamic";

export default async function CuentasPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = session.user.id;
  const baseCurrency = session.user.baseCurrency;

  const [accounts, rates] = await Promise.all([
    prisma.account.findMany({
      where: { userId, isArchived: false },
      orderBy: { createdAt: "asc" },
    }),
    prisma.exchangeRate.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 50,
    }),
  ]);

  const accountsData = accounts.map((a) => {
    const converted = convertAmount(
      Number(a.currentBalance),
      a.currency,
      baseCurrency,
      rates.map((r) => ({ from: r.from, to: r.to, rate: Number(r.rate) })),
    );
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      currency: a.currency,
      balance: Number(a.currentBalance),
      convertedBalance: Number(converted.toFixed(4)),
      icon: a.icon,
      color: a.color,
      isActive: a.isActive,
    };
  });

  return (
    <AccountsClient
      accounts={accountsData}
      baseCurrency={baseCurrency}
    />
  );
}