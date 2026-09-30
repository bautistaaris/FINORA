import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { convertAmount } from "@/lib/finance";
import { DebtsClient } from "./DebtsClient";

export const dynamic = "force-dynamic";

export default async function DebtsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = session.user.id;
  const baseCurrency = session.user.baseCurrency;

  const [debts, rates] = await Promise.all([
    prisma.debt.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.exchangeRate.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 50,
    }),
  ]);

  const data = debts.map((d) => {
    const converted = convertAmount(
      Number(d.remainingAmount),
      d.currency,
      baseCurrency,
      rates.map((r) => ({ from: r.from, to: r.to, rate: Number(r.rate) })),
    );
    const original = Number(d.originalAmount);
    const remaining = Number(d.remainingAmount);
    const progress = original > 0 ? 1 - remaining / original : 0;
    return {
      id: d.id,
      name: d.name,
      currency: d.currency,
      originalAmount: original,
      remainingAmount: remaining,
      convertedRemaining: Number(converted.toFixed(4)),
      interestRate: d.interestRate !== null ? Number(d.interestRate) : null,
      dueDate: d.dueDate?.toISOString() ?? null,
      status: d.status as "ACTIVE" | "PAID" | "CANCELLED",
      installments: d.installments,
      progress,
    };
  });

  return <DebtsClient debts={data} baseCurrency={baseCurrency} />;
}