import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enqueueEntityEvent } from "@/lib/sync/helpers";

const createDebtSchema = z.object({
  name: z.string().min(1).max(100),
  originalAmount: z.number().positive().finite(),
  remainingAmount: z.number().nonnegative().finite(),
  currency: z.string().min(2).max(8),
  installments: z.number().int().positive().optional().nullable(),
  interestRate: z.number().nonnegative().finite().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  status: z.enum(["ACTIVE", "PAID", "CANCELLED"]).default("ACTIVE"),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const debts = await prisma.debt.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ data: debts });
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
  const parsed = createDebtSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const created = await prisma.$transaction(async (tx) => {
    const d = await tx.debt.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name,
        originalAmount: new Prisma.Decimal(parsed.data.originalAmount),
        remainingAmount: new Prisma.Decimal(parsed.data.remainingAmount),
        currency: parsed.data.currency,
        installments: parsed.data.installments ?? null,
        interestRate:
          parsed.data.interestRate !== undefined && parsed.data.interestRate !== null
            ? new Prisma.Decimal(parsed.data.interestRate)
            : null,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
        status: parsed.data.status,
      },
    });
    await enqueueEntityEvent(tx, {
      userId: session.user.id,
      entityType: "Debt",
      entity: { ...d },
      operation: "CREATE",
    });
    return d;
  });

  return NextResponse.json({ data: created }, { status: 201 });
}