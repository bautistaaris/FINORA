import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enqueueEntityEvent } from "@/lib/sync/helpers";

const createSubSchema = z.object({
  name: z.string().min(1).max(100),
  amount: z.number().positive().finite(),
  currency: z.string().min(2).max(8),
  frequency: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"]),
  customDays: z.number().int().positive().optional().nullable(),
  nextBillingDate: z.string().datetime(),
  accountId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  notes: z.string().max(500).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const subs = await prisma.subscription.findMany({
    where: { userId: session.user.id },
    orderBy: { nextBillingDate: "asc" },
  });
  return NextResponse.json({ data: subs });
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
  const parsed = createSubSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const created = await prisma.$transaction(async (tx) => {
    const sub = await tx.subscription.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name,
        amount: new Prisma.Decimal(parsed.data.amount),
        currency: parsed.data.currency,
        frequency: parsed.data.frequency,
        customDays: parsed.data.customDays ?? null,
        nextBillingDate: new Date(parsed.data.nextBillingDate),
        accountId: parsed.data.accountId ?? null,
        categoryId: parsed.data.categoryId ?? null,
        notes: parsed.data.notes,
        status: "ACTIVE",
      },
    });
    await enqueueEntityEvent(tx, {
      userId: session.user.id,
      entityType: "Subscription",
      entity: { ...sub },
      operation: "CREATE",
    });
    return sub;
  });

  return NextResponse.json({ data: created }, { status: 201 });
}