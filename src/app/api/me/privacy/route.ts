import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null) as { privacyMode?: boolean } | null;
  if (typeof body?.privacyMode !== "boolean") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  await prisma.user.update({
    where: { id: session.user.id },
    data: { privacyMode: body.privacyMode },
  });
  return NextResponse.json({ ok: true, privacyMode: body.privacyMode });
}