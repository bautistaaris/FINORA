import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enqueueEntityEvent } from "@/lib/sync/helpers";

const createAccSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum([
    "CASH",
    "BANK",
    "WALLET",
    "CREDIT_CARD",
    "BROKER",
    "CRYPTO",
    "OTHER",
  ]),
  currency: z.string().min(2).max(8),
  initialBalance: z.number().finite().default(0),
  currentBalance: z.number().finite().optional(),
  icon: z.string().max(50).optional(),
  color: z.string().max(20).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const accounts = await prisma.account.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ data: accounts });
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
  const parsed = createAccSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const data = parsed.data;
  const initial = new Prisma.Decimal(data.initialBalance);

  const created = await prisma.$transaction(async (tx) => {
    const acc = await tx.account.create({
      data: {
        userId: session.user.id,
        name: data.name,
        type: data.type,
        currency: data.currency,
        initialBalance: initial,
        currentBalance: data.currentBalance !== undefined
          ? new Prisma.Decimal(data.currentBalance)
          : initial,
        icon: data.icon,
        color: data.color,
      },
    });
    await enqueueEntityEvent(tx, {
      userId: session.user.id,
      entityType: "Account",
      entity: { ...acc },
      operation: "CREATE",
    });
    return acc;
  });

  return NextResponse.json({ data: created }, { status: 201 });
}