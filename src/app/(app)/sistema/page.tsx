import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { promises as fs } from "node:fs";
import path from "node:path";
import { SystemClient } from "./SystemClient";

export const dynamic = "force-dynamic";

export default async function SystemPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = session.user.id;

  const [
    pendingCount,
    failedCount,
    totalSynced,
    dbHealthy,
    diskInfo,
    lastEvent,
    lastVaultSync,
  ] = await Promise.all([
    prisma.syncEvent.count({
      where: { userId, status: { in: ["PENDING", "FAILED"] } },
    }),
    prisma.syncEvent.count({ where: { userId, status: "FAILED" } }),
    prisma.syncEvent.count({ where: { userId, status: "COMPLETED" } }),
    pingDb(),
    getDiskInfo(),
    prisma.syncEvent.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, status: true, entityType: true },
    }),
    prisma.syncSnapshot.findUnique({ where: { userId } }),
  ]);

  const vaultPath = process.env.OBSIDIAN_VAULT_PATH ?? null;
  let vaultExists = false;
  if (vaultPath) {
    try {
      await fs.access(vaultPath);
      vaultExists = true;
    } catch {
      vaultExists = false;
    }
  }

  return (
    <SystemClient
      data={{
        serverNow: new Date().toISOString(),
        db: dbHealthy,
        vault: vaultExists ? "ok" : "missing",
        vaultPath,
        pendingCount,
        failedCount,
        totalSynced,
        lastEvent: lastEvent
          ? {
              at: lastEvent.createdAt.toISOString(),
              status: lastEvent.status,
              entityType: lastEvent.entityType,
            }
          : null,
        lastVaultSync: lastVaultSync?.lastVaultSync?.toISOString() ?? null,
        lastVaultError: lastVaultSync?.lastVaultError ?? null,
        workerEnabled: lastVaultSync?.workerEnabled ?? true,
        disk: diskInfo,
      }}
    />
  );
}

async function pingDb(): Promise<"ok" | "error"> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return "ok";
  } catch {
    return "error";
  }
}

async function getDiskInfo(): Promise<{ free: number | null; total: number | null }> {
  try {
    const { statfs } = await import("node:fs/promises");
    const stats = await statfs(process.cwd());
    return {
      free: stats.bavail * stats.bsize,
      total: stats.blocks * stats.bsize,
    };
  } catch {
    return { free: null, total: null };
  }
}