import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { processBatch } from "@/lib/sync/worker";

export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
  if (!vaultPath) return NextResponse.json({ error: "Vault not configured" }, { status: 500 });

  const stats = await processBatch({
    vaultPath,
    batchSize: 100,
    verbose: false,
  });

  return NextResponse.json({
    ok: stats.failed === 0,
    processed: stats.processed,
    failed: stats.failed,
    skipped: stats.skipped,
    errors: stats.errors,
  });
}