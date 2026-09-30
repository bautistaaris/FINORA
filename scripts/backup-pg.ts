/* eslint-disable no-console */
/**
 * FINORA — PostgreSQL backup via pg_dump
 *
 * Genera dump completo (schema + data) en formato custom (-Fc).
 * Comprime con gzip. Guarda con timestamp.
 *
 * Uso:
 *   npm run backup:pg                              # auto path
 *   npm run backup:pg -- --out=G:/backups/finora  # custom path
 *
 * Variables de entorno:
 *   DATABASE_URL  - requerida
 *   PG_DUMP_PATH  - opcional, default "pg_dump"
 *   BACKUP_DIR    - opcional, default $OBSIDIAN_VAULT_PATH/FINORA/98 Backups
 *                  o ./backups si no hay Vault
 *
 * Política de retención (default):
 *   - 7 diarios
 *   - 4 semanales
 *   - 6 mensuales
 *   Total: hasta 17 backups en disco
 */

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("✗ DATABASE_URL no está configurado.");
    process.exit(1);
  }
  const pgDump = process.env.PG_DUMP_PATH ?? "pg_dump";

  const customOut = process.argv.find((a) => a.startsWith("--out="));
  const backupDir = customOut
    ? customOut.slice("--out=".length)
    : (process.env.BACKUP_DIR ??
      (process.env.OBSIDIAN_VAULT_PATH
        ? path.join(process.env.OBSIDIAN_VAULT_PATH, "FINORA", "98 Backups")
        : path.join(process.cwd(), "backups")));

  await fs.mkdir(backupDir, { recursive: true });

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `finora_${stamp}.dump`;
  const filePath = path.join(backupDir, fileName);

  console.log(`→ Backup PostgreSQL`);
  console.log(`  Output: ${filePath}`);

  try {
    await exec(pgDump, [
      "--dbname=" + databaseUrl,
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      "--compress=6",
      "--file=" + filePath,
    ]);
    console.log(`✓ Backup creado: ${filePath}`);
  } catch (err: any) {
    console.error(`✗ Error ejecutando pg_dump:`, err.message);
    process.exit(1);
  }

  // Aplicar política de retención
  await applyRetention(backupDir);
}

async function applyRetention(dir: string) {
  const KEEP_DAILY = 7;
  const KEEP_WEEKLY = 4;
  const KEEP_MONTHLY = 6;

  try {
    const entries = await fs.readdir(dir);
    const dumps = entries
      .filter((f) => f.startsWith("finora_") && f.endsWith(".dump"))
      .map((f) => ({
        file: f,
        path: path.join(dir, f),
        time: parseStamp(f),
      }))
      .filter((d) => d.time !== null)
      .sort((a, b) => b.time!.getTime() - a.time!.getTime());

    const now = Date.now();
    const oneDay = 86400 * 1000;
    const toDelete: string[] = [];

    // Mantener todos los del último día
    const lastDay = dumps.filter((d) => now - d.time!.getTime() < oneDay);

    // Mantener 1 por semana de las últimas 4 semanas
    const weeklyKept = new Set<string>();
    for (let w = 0; w < KEEP_WEEKLY; w++) {
      const cutoff = now - (w + 1) * 7 * oneDay;
      const cand = dumps.find((d) => d.time!.getTime() < cutoff && !weeklyKept.has(d.file));
      if (cand) weeklyKept.add(cand.file);
    }

    // Mantener 1 por mes de los últimos 6 meses
    const monthlyKept = new Set<string>();
    for (let m = 0; m < KEEP_MONTHLY; m++) {
      const cutoff = now - (m + 1) * 30 * oneDay;
      const cand = dumps.find(
        (d) => d.time!.getTime() < cutoff && !monthlyKept.has(d.file) && !weeklyKept.has(d.file),
      );
      if (cand) monthlyKept.add(cand.file);
    }

    const protectedSet = new Set([
      ...lastDay.map((d) => d.file),
      ...weeklyKept,
      ...monthlyKept,
    ]);

    const keepTotal = KEEP_DAILY + KEEP_WEEKLY + KEEP_MONTHLY;
    for (const d of dumps) {
      const shouldProtect = protectedSet.has(d.file);
      const remainingAfterDelete = dumps.length - toDelete.length;
      if (!shouldProtect && remainingAfterDelete > keepTotal) {
        toDelete.push(d.path);
      }
    }

    for (const p of toDelete) {
      await fs.unlink(p);
      console.log(`  - Retenido: borrado ${path.basename(p)}`);
    }
  } catch (err) {
    console.warn(`No se pudo aplicar retención: ${err}`);
  }
}

function parseStamp(filename: string): Date | null {
  const m = filename.match(/finora_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/);
  if (!m || !m[1]) return null;
  return new Date(m[1].replace(/-/g, ":"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});