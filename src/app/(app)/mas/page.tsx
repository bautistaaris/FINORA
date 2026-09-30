import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MasClient } from "./MasClient";

export const dynamic = "force-dynamic";

export default async function MasPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = session.user.id;

  const [user, rates, accounts, subs, txCount, investmentCount] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.exchangeRate.findMany({
      where: { userId },
      orderBy: { date: "desc" },
      take: 1,
    }),
    prisma.account.count({ where: { userId } }),
    prisma.subscription.count({ where: { userId, status: "ACTIVE" } }),
    prisma.transaction.count({ where: { userId } }),
    prisma.investment.count({ where: { userId } }),
  ]);

  async function logoutAction() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <MasClient
      user={{
        email: user?.email ?? "",
        name: user?.name ?? null,
        baseCurrency: user?.baseCurrency ?? "ARS",
        privacyMode: user?.privacyMode ?? false,
      }}
      lastRate={
        rates[0]
          ? {
              from: rates[0].from,
              to: rates[0].to,
              rate: Number(rates[0].rate),
              date: rates[0].date.toISOString(),
            }
          : null
      }
      counts={{
        accounts,
        subscriptions: subs,
        transactions: txCount,
        investments: investmentCount,
      }}
      logoutAction={logoutAction}
    />
  );
}