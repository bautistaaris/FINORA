import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enqueueEntityEvent } from "@/lib/sync/helpers";

const createTxSchema = z.object({
  type: z.enum(["EXPENSE", "INCOME", "TRANSFER", "INVESTMENT"]),
  amount: z.number().positive().finite(),
  currency: z.string().min(2).max(8),
  accountId: z.string().min(1),
  destinationAccountId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  investmentId: z.string().nullable().optional(),
  description: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
  paymentMethod: z.string().max(50).optional(),
  date: z.string().datetime().optional(),
  exchangeRate: z.number().positive().finite().optional().nullable(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const txs = await prisma.transaction.findMany({
    where: { userId: session.user.id },
    orderBy: { date: "desc" },
    take: 500,
  });
  return NextResponse.json({ data: txs });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createTxSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  const sourceAcc = await prisma.account.findFirst({
    where: { id: data.accountId, userId },
  });
  if (!sourceAcc) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  if (data.destinationAccountId) {
    const dest = await prisma.account.findFirst({
      where: { id: data.destinationAccountId, userId },
    });
    if (!dest) return NextResponse.json({ error: "Destination account not found" }, { status: 404 });
    if (dest.id === sourceAcc.id)
      return NextResponse.json({ error: "Same source/destination" }, { status: 400 });
  }
  if (data.categoryId) {
    const cat = await prisma.category.findFirst({
      where: { id: data.categoryId, userId },
    });
    if (!cat) return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  const amountDecimal = new Prisma.Decimal(data.amount);

  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.transaction.create({
      data: {
        userId,
        type: data.type,
        amount: amountDecimal,
        currency: data.currency,
        accountId: data.accountId,
        destinationAccountId: data.destinationAccountId ?? null,
        categoryId: data.categoryId ?? null,
        description: data.description,
        notes: data.notes,
        paymentMethod: data.paymentMethod,
        date: data.date ? new Date(data.date) : new Date(),
        exchangeRate:
          data.exchangeRate !== undefined && data.exchangeRate !== null
            ? new Prisma.Decimal(data.exchangeRate)
            : null,
      },
    });

    if (data.type === "EXPENSE") {
      await tx.account.update({
        where: { id: sourceAcc.id },
        data: { currentBalance: { decrement: amountDecimal } },
      });
    } else if (data.type === "INCOME") {
      await tx.account.update({
        where: { id: sourceAcc.id },
        data: { currentBalance: { increment: amountDecimal } },
      });
    } else if (data.type === "TRANSFER" && data.destinationAccountId) {
      const rate =
        data.exchangeRate !== undefined && data.exchangeRate !== null
          ? new Prisma.Decimal(data.exchangeRate)
          : new Prisma.Decimal(1);
      await tx.account.update({
        where: { id: sourceAcc.id },
        data: { currentBalance: { decrement: amountDecimal } },
      });
      await tx.account.update({
        where: { id: data.destinationAccountId },
        data: { currentBalance: { increment: amountDecimal.times(rate) } },
      });
    } else if (data.type === "INVESTMENT") {
      await tx.account.update({
        where: { id: sourceAcc.id },
        data: { currentBalance: { decrement: amountDecimal } },
      });
      if (data.investmentId) {
        const inv = await tx.investment.findFirst({
          where: { id: data.investmentId, userId },
        });
        if (!inv) throw new Error("Investment not found");
        await tx.investmentTransaction.create({
          data: {
            investmentId: inv.id,
            type: "BUY",
            amount: amountDecimal,
            currency: data.currency,
            date: new Date(),
          },
        });
      }
    }

    // OUTBOX: encolar evento en la MISMA transacción
    await enqueueEntityEvent(tx, {
      userId,
      entityType: "Transaction",
      entity: { ...created },
      operation: "CREATE",
    });

    return created;
  });

  return NextResponse.json({ data: result }, { status: 201 });
}