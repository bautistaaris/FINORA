import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { calcPositionPL } from "@/lib/finance";
import { InvestmentsClient } from "./InvestmentsClient";

export const dynamic = "force-dynamic";

export default async function InversionesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = session.user.id;
  const baseCurrency = session.user.baseCurrency;

  const investments = await prisma.investment.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: {
      transactions: { orderBy: { date: "desc" }, take: 10 },
    },
  });

  const items = investments.map((inv) => {
    const pl = calcPositionPL({
      quantity: Number(inv.quantity),
      averagePurchasePrice: Number(inv.averagePurchasePrice),
      currentPrice: Number(inv.currentPrice),
    });
    return {
      id: inv.id,
      name: inv.name,
      ticker: inv.ticker,
      assetType: inv.assetType,
      currency: inv.currency,
      quantity: Number(inv.quantity),
      averagePurchasePrice: Number(inv.averagePurchasePrice),
      currentPrice: Number(inv.currentPrice),
      investedCapital: pl.investedCapital,
      currentValue: pl.currentValue,
      profitLoss: pl.profitLoss,
      profitLossPct: pl.profitLossPct,
      transactions: inv.transactions.map((t) => ({
        id: t.id,
        type: t.type,
        quantity: Number(t.quantity),
        price: Number(t.price),
        amount: Number(t.amount),
        currency: t.currency,
        date: t.date.toISOString(),
      })),
    };
  });

  return <InvestmentsClient items={items} baseCurrency={baseCurrency} />;
}