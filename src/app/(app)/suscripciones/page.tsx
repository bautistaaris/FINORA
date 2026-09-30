import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  calcSubscriptionMonthlyCost,
  calcSubscriptionAnnualCost,
  formatMoney,
} from "@/lib/finance";
import { SubscriptionsClient } from "./SubscriptionsClient";

export const dynamic = "force-dynamic";

export default async function SubscriptionsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = session.user.id;
  const baseCurrency = session.user.baseCurrency;

  const subs = await prisma.subscription.findMany({
    where: { userId },
    orderBy: { nextBillingDate: "asc" },
  });

  const subsData = subs.map((s) => ({
    id: s.id,
    name: s.name,
    amount: Number(s.amount),
    currency: s.currency,
    frequency: s.frequency as "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM",
    customDays: s.customDays,
    nextBillingDate: s.nextBillingDate.toISOString(),
    status: s.status as "ACTIVE" | "PAUSED" | "CANCELLED",
    monthlyEquivalent: calcSubscriptionMonthlyCost(
      Number(s.amount),
      s.frequency as never,
      s.customDays,
    ),
    annualEquivalent: calcSubscriptionAnnualCost(
      Number(s.amount),
      s.frequency as never,
      s.customDays,
    ),
  }));

  const totalMonthly = subsData
    .filter((s) => s.status === "ACTIVE")
    .reduce((acc, s) => acc + s.monthlyEquivalent, 0);

  return (
    <SubscriptionsClient
      subscriptions={subsData}
      baseCurrency={baseCurrency}
      totalMonthlyConverted={totalMonthly}
    />
  );
}