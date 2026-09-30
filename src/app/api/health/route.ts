import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * /api/health — Health check público.
 *
 * Devuelve:
 *  - status: "ok" | "degraded"
 *  - db: "ok" | "error"
 *  - timestamp
 *
 * NO expone información sensible.
 * Usado por uptime monitors externos (Vercel, BetterStack, etc.)
 */
export async function GET() {
  let dbStatus: "ok" | "error" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "error";
  }
  return NextResponse.json(
    {
      status: dbStatus === "ok" ? "ok" : "degraded",
      db: dbStatus,
      timestamp: new Date().toISOString(),
    },
    {
      status: dbStatus === "ok" ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}