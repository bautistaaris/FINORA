import { NextResponse } from "next/server";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { auth } from "@/lib/auth";
import path from "node:path";

const execAsync = promisify(exec);

/**
 * Ejecuta `npm run vault:rebuild` para regenerar todos los archivos del Vault.
 * Pide confirmación via UI (botón confirmar antes de llamar).
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cwd = process.cwd();
  try {
    const { stdout, stderr } = await execAsync(
      "npx tsx scripts/vault-rebuild.ts",
      { cwd, timeout: 60_000, env: process.env },
    );
    const out = stdout + stderr;
    const m = out.match(/Transactions:\s+(\d+)/);
    const regenerated = m ? Number(m[1]) : 0;
    return NextResponse.json({ ok: true, regenerated, output: out });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}