import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enqueueOutbox } from "@/lib/sync/outbox";
import { serializeForClient } from "@/lib/finance";

const updateTxSchema = z.object({
  amount: z.number().positive().finite().optional(),
  description: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
  categoryId: z.string().nullable().optional(),
  date: z.string().datetime().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const tx = await prisma.transaction.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!tx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ data: tx });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = updateTxSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const existing = await prisma.transaction.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.transaction.update({
      where: { id },
      data: {
        ...parsed.data,
        amount:
          parsed.data.amount !== undefined
            ? new Prisma.Decimal(parsed.data.amount)
            : undefined,
        date: parsed.data.date ? new Date(parsed.data.date) : undefined,
      },
    });
    const account = await tx.account.findUnique({ where: { id: updated.accountId } });
    const destAccount = updated.destinationAccountId
      ? await tx.account.findUnique({ where: { id: updated.destinationAccountId } })
      : null;
    const category = updated.categoryId
      ? await tx.category.findUnique({ where: { id: updated.categoryId } })
      : null;
    const outboxPayload = serializeForClient({
      ...updated,
      account: account ? { id: account.id, name: account.name, currency: account.currency } : null,
      destinationAccount: destAccount ? { id: destAccount.id, name: destAccount.name } : null,
      category: category ? { id: category.id, name: category.name, type: category.type } : null,
    });
    await enqueueOutbox(tx, {
      userId: session.user.id,
      entityType: "Transaction",
      entityId: updated.id,
      operation: "UPDATE",
      payload: outboxPayload,
      recordVersion: (await getLastVersion(tx, "Transaction", updated.id)) + 1,
    });
    return updated;
  });

  return NextResponse.json({ data: result });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.transaction.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    const rate = existing.exchangeRate ?? new Prisma.Decimal(1);
    if (existing.type === "EXPENSE") {
      await tx.account.update({
        where: { id: existing.accountId },
        data: { currentBalance: { increment: existing.amount } },
      });
    } else if (existing.type === "INCOME") {
      await tx.account.update({
        where: { id: existing.accountId },
        data: { currentBalance: { decrement: existing.amount } },
      });
    } else if (existing.type === "TRANSFER" && existing.destinationAccountId) {
      await tx.account.update({
        where: { id: existing.accountId },
        data: { currentBalance: { increment: existing.amount } },
      });
      await tx.account.update({
        where: { id: existing.destinationAccountId },
        data: { currentBalance: { decrement: existing.amount.times(rate) } },
      });
    } else if (existing.type === "INVESTMENT") {
      await tx.account.update({
        where: { id: existing.accountId },
        data: { currentBalance: { increment: existing.amount } },
      });
    }

    await enqueueOutbox(tx, {
      userId: session.user.id,
      entityType: "Transaction",
      entityId: existing.id,
      operation: "DELETE",
      payload: { id: existing.id, deleted: true },
      recordVersion: (await getLastVersion(tx, "Transaction", existing.id)) + 1,
    });

    await tx.transaction.delete({ where: { id } });
  });

  return NextResponse.json({ ok: true });
}

/**
 * Helper: última recordVersion procesada para un entity.
 */
async function getLastVersion(
  tx: Prisma.TransactionClient,
  entityType: string,
  entityId: string,
): Promise<number> {
  const last = await tx.syncEvent.findFirst({
    where: { entityType, entityId },
    orderBy: { recordVersion: "desc" },
    select: { recordVersion: true },
  });
  return last?.recordVersion ?? 0;
}