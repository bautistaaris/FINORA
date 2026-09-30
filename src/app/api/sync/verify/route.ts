import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Verifica que los counts de DB coincidan con archivos en Vault.
 * No toca archivos — sólo lee.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
  if (!vaultPath) return NextResponse.json({ error: "Vault not configured" }, { status: 500 });

  // Contar archivos en Vault
  const counts = { account: 0, transaction: 0, investment: 0, subscription: 0, budget: 0, debt: 0 };
  try {
    const { promises: fs } = await import("node:fs");
    const path = await import("node:path");
    const { parseMarkdown } = await import("@/lib/obsidian/frontmatter");

    async function walk(dir: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) await walk(p);
        else if (e.isFile() && p.endsWith(".md") && !p.includes("99 System")) {
          const content = await fs.readFile(p, "utf-8");
          const { data } = parseMarkdown(content);
          const t = String(data.entity_type ?? "");
          if (t === "account") counts.account++;
          else if (t === "transaction") counts.transaction++;
          else if (t === "investment") counts.investment++;
          else if (t === "subscription") counts.subscription++;
          else if (t === "budget") counts.budget++;
          else if (t === "debt") counts.debt++;
        }
      }
    }
    await walk(path.join(vaultPath, "FINORA"));
  } catch {
    return NextResponse.json({ ok: false, error: "Vault unreadable" }, { status: 500 });
  }

  const dbCounts = {
    account: await prisma.account.count({ where: { userId } }),
    transaction: await prisma.transaction.count({ where: { userId } }),
    investment: await prisma.investment.count({ where: { userId } }),
    subscription: await prisma.subscription.count({ where: { userId } }),
    budget: await prisma.budget.count({ where: { userId } }),
    debt: await prisma.debt.count({ where: { userId } }),
  };

  const summary = `Acc=${counts.account}/${dbCounts.account} · Tx=${counts.transaction}/${dbCounts.transaction} · Inv=${counts.investment}/${dbCounts.investment} · Sub=${counts.subscription}/${dbCounts.subscription} · Bud=${counts.budget}/${dbCounts.budget} · Debt=${counts.debt}/${dbCounts.debt}`;

  const ok =
    counts.account === dbCounts.account &&
    counts.transaction === dbCounts.transaction &&
    counts.investment === dbCounts.investment &&
    counts.subscription === dbCounts.subscription &&
    counts.budget === dbCounts.budget &&
    counts.debt === dbCounts.debt;

  return NextResponse.json({ ok, summary, vault: counts, db: dbCounts });
}