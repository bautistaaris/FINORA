import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const createCatSchema = z.object({
  name: z.string().min(1).max(50),
  type: z.enum(["EXPENSE", "INCOME"]),
  icon: z.string().max(50).optional(),
  color: z.string().max(20).optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cats = await prisma.category.findMany({
    where: { userId: session.user.id },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ data: cats });
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
  const parsed = createCatSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  try {
    const created = await prisma.category.create({
      data: {
        userId: session.user.id,
        name: parsed.data.name,
        type: parsed.data.type,
        icon: parsed.data.icon,
        color: parsed.data.color,
      },
    });
    return NextResponse.json({ data: created }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Ya existe una categoría con ese nombre y tipo." },
      { status: 409 },
    );
  }
}