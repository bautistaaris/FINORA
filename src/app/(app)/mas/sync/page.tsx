import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { promises as fs } from "node:fs";
import path from "node:path";
import { SyncClient } from "./SyncClient";

export const dynamic = "force-dynamic";

export default async function SyncPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const userId = session.user.id;

  const [snapshot, pendingCount, failedCount, totalSynced, recentEvents] = await Promise.all([
    prisma.syncSnapshot.findUnique({ where: { userId } }),
    prisma.syncEvent.count({ where: { userId, status: { in: ["PENDING", "FAILED"] } } }),
    prisma.syncEvent.count({ where: { userId, status: "FAILED" } }),
    prisma.syncEvent.count({ where: { userId, status: "COMPLETED" } }),
    prisma.syncEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        entityType: true,
        entityId: true,
        operation: true,
        status: true,
        attempts: true,
        lastError: true,
        createdAt: true,
        processedAt: true,
      },
    }),
  ]);

  const vaultPath = process.env.OBSIDIAN_VAULT_PATH ?? null;
  let vaultStat: { totalFiles: number; sizeBytes: number } | null = null;
  if (vaultPath) {
    vaultStat = await getVaultStat(vaultPath);
  }

  return (
    <SyncClient
      data={{
        vaultPath,
        workerEnabled: snapshot?.workerEnabled ?? true,
        lastVaultSync: snapshot?.lastVaultSync?.toISOString() ?? null,
        lastVaultError: snapshot?.lastVaultError ?? null,
        pendingCount,
        failedCount,
        totalSynced,
        vaultStat,
        events: recentEvents.map((e) => ({
          id: e.id,
          entityType: e.entityType,
          entityId: e.entityId,
          operation: e.operation,
          status: e.status,
          attempts: e.attempts,
          lastError: e.lastError,
          createdAt: e.createdAt.toISOString(),
          processedAt: e.processedAt?.toISOString() ?? null,
        })),
      }}
    />
  );
}

async function getVaultStat(
  vaultPath: string,
): Promise<{ totalFiles: number; sizeBytes: number } | null> {
  let totalFiles = 0;
  let sizeBytes = 0;
  try {
    await walk(vaultPath, (f) => {
      if (!f.endsWith(".md")) return;
      totalFiles++;
    });
    // Para el tamaño real, usar stat
    const { stat } = await import("node:fs/promises");
    await walk(vaultPath, async (f) => {
      if (!f.endsWith(".md")) return;
      try {
        const s = await stat(f);
        sizeBytes += s.size;
      } catch {
        // ignore
      }
    });
    return { totalFiles, sizeBytes };
  } catch {
    return null;
  }
}

async function walk(dir: string, fn: (file: string) => void | Promise<void>): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, fn);
    else await fn(p);
  }
}