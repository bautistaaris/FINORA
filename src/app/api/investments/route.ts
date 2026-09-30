import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enqueueEntityEvent } from "@/lib/sync/helpers";

const createInvSchema = z.object({
  name: z.string().min(1).max(100),
  ticker: z.string().max(20).optional().nullable(),
  assetType: z.enum([
    "STOCK",
    "CEDEAR",
    "ETF",
    "CRYPTO",
    "BOND",
    "FUND",
    "FIXED_TERM",
    "CASH",
    "OTHER",
  ]),
  currency: z.string().min(2).max(8),
  quantity: z.number().nonnegative().finite(),
  averagePurchasePrice: z.number().nonnegative().finite(),
  currentPrice: z.number().nonnegative().finite(),
  accountId: z.string().optional().nullable(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items = await prisma.investment.findMany({
    where: { userId: session.user.id },
  });
  return NextResponse.json({ data: items });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createInvSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const created = await prisma.$transaction(async (tx) => {
    const inv = await tx.investment.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name,
        ticker: parsed.data.ticker,
        assetType: parsed.data.assetType,
        currency: parsed.data.currency,
        quantity: new Prisma.Decimal(parsed.data.quantity),
        averagePurchasePrice: new Prisma.Decimal(parsed.data.averagePurchasePrice),
        currentPrice: new Prisma.Decimal(parsed.data.currentPrice),
        accountId: parsed.data.accountId ?? null,
      },
    });
    await enqueueEntityEvent(tx, {
      userId: session.user.id,
      entityType: "Investment",
      entity: { ...inv },
      operation: "CREATE",
    });
    return inv;
  });

  return NextResponse.json({ data: created }, { status: 201 });
}