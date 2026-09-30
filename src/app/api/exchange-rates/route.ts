import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as
    | { from?: string; to?: string; rate?: number; source?: string }
    | null;
  if (!body?.from || !body.to || !body.rate || body.rate <= 0) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const created = await prisma.exchangeRate.create({
    data: {
      userId: session.user.id,
      from: body.from,
      to: body.to,
      rate: new Prisma.Decimal(body.rate),
      source: body.source ?? "MANUAL",
    },
  });
  return NextResponse.json({ data: created }, { status: 201 });
}