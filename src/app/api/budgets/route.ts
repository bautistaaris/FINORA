import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { enqueueEntityEvent } from "@/lib/sync/helpers";

const createBudgetSchema = z.object({
  categoryId: z.string().min(1),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  limitAmount: z.number().positive().finite(),
  currency: z.string().min(2).max(8),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await prisma.budget.findMany({
    where: { userId: session.user.id },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  return NextResponse.json({ data });
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
  const parsed = createBudgetSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  try {
    const created = await prisma.$transaction(async (tx) => {
      const b = await tx.budget.create({
        data: {
          userId: session.user.id,
          categoryId: parsed.data.categoryId,
          month: parsed.data.month,
          year: parsed.data.year,
          limitAmount: new Prisma.Decimal(parsed.data.limitAmount),
          currency: parsed.data.currency,
        },
      });
      await enqueueEntityEvent(tx, {
        userId: session.user.id,
        entityType: "Budget",
        entity: { ...b },
        operation: "CREATE",
      });
      return b;
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch {
      return NextResponse.json(
        { error: "Ya existe un presupuesto para esta categoría y mes." },
        { status: 409 },
      );
    }
}