import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { InvestmentNewClient } from "./InvestmentNewClient";

export const dynamic = "force-dynamic";

export default async function NewInvestmentPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const accounts = await prisma.account.findMany({
    where: { userId: session.user.id, isActive: true },
  });
  return (
    <InvestmentNewClient
      accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
    />
  );
}