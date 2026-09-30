/* eslint-disable no-console */
/**
 * FINORA — PostgreSQL backup via pg_dump
 *
 * Genera dump completo (schema + data) en formato custom (-Fc).
 * Comprime con gzip interno de pg_dump.
 *
 * Uso:
 *   npm run backup:pg                              # auto path
 *   npm run backup:pg -- --out=G:/backups/finora  # custom path
 *
 * Variables de entorno:
 *   DATABASE_URL         - requerida
 *   PG_DUMP_PATH         - opcional, default "pg_dump"
 *   FINORA_BACKUP_PATH   - opcional; si no, usa ${OBSIDIAN_VAULT_PATH}/FINORA/98 Backups
 *                          o ./backups si no hay Vault
 *
 * Política de retención (configurable por env):
 *   FINORA_BACKUP_KEEP_DAILY=7
 *   FINORA_BACKUP_KEEP_WEEKLY=4
 *   FINORA_BACKUP_KEEP_MONTHLY=6
 *
 * Output:
 *   <backup>/finora_YYYY-MM-DDTHH-MM-SS.dump
 *   <backup>/finora_YYYY-MM-DDTHH-MM-SS.dump.manifest.json  ← metadata
 *
 * El manifest contiene:
 *   - timestamp, DB URL (sin password), schema, app version
 *   - size, SHA-256 del dump
 *   - exit code del pg_dump
 *
 * Si el pg_dump falla, NO se crea el manifest.
 */

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { promisify } from "node:util";

const exec = promisify(execFile);

interface BackupManifest {
  version: 1;
  timestamp: string;
  filename: string;
  sizeBytes: number;
  checksumSha256: string;
  pgDumpCommand: string;
  exitCode: number;
  databaseUrlSafe: string;
  appVersion: string;
  prismaSchemaVersion: number | null;
  retention: {
    keepDaily: number;
    keepWeekly: number;
    keepMonthly: number;
  };
}

function safeDbUrl(url: string): string {
  // Ocultar password del DATABASE_URL para logging/manifest
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "<invalid>";
  }
}

function getAppVersion(): string {
  try {
    const pkg = require("../package.json");
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

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
    : (process.env.FINORA_BACKUP_PATH ??
      (process.env.OBSIDIAN_VAULT_PATH
        ? path.join(process.env.OBSIDIAN_VAULT_PATH, "FINORA", "98 Backups")
        : path.join(process.cwd(), "backups")));

  await fs.mkdir(backupDir, { recursive: true });

  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const fileName = `finora_${stamp}.dump`;
  const filePath = path.join(backupDir, fileName);
  const manifestPath = filePath + ".manifest.json";

  console.log(`→ Backup PostgreSQL`);
  console.log(`  Output:  ${filePath}`);
  console.log(`  Manifest: ${manifestPath}`);

  const pgArgs = [
    "--dbname=" + databaseUrl,
    "--format=custom",
    "--no-owner",
    "--no-privileges",
    "--compress=6",
    "--file=" + filePath,
  ];

  let exitCode = 0;
  let errorMsg: string | undefined;
  try {
    await exec(pgDump, pgArgs);
    console.log(`✓ pg_dump OK`);
  } catch (err: any) {
    errorMsg = err.message ?? String(err);
    exitCode = err.code ?? 1;
    console.error(`✗ pg_dump falló (exit ${exitCode}):`, errorMsg);
    process.exit(1);
  }

  // Calcular checksum + size
  let sizeBytes = 0;
  let checksum = "";
  try {
    const data = await fs.readFile(filePath);
    sizeBytes = data.length;
    checksum = crypto.createHash("sha256").update(data).digest("hex");
  } catch (err: any) {
    console.error(`✗ No se pudo leer el dump para hashear:`, err.message);
    process.exit(1);
  }

  const retention = {
    keepDaily: Number(process.env.FINORA_BACKUP_KEEP_DAILY ?? 7),
    keepWeekly: Number(process.env.FINORA_BACKUP_KEEP_WEEKLY ?? 4),
    keepMonthly: Number(process.env.FINORA_BACKUP_KEEP_MONTHLY ?? 6),
  };

  const manifest: BackupManifest = {
    version: 1,
    timestamp: now.toISOString(),
    filename: fileName,
    sizeBytes,
    checksumSha256: checksum,
    pgDumpCommand: `${pgDump} ${pgArgs.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`,
    exitCode,
    databaseUrlSafe: safeDbUrl(databaseUrl),
    appVersion: getAppVersion(),
    prismaSchemaVersion: null, // se llenará automáticamente en el futuro
    retention,
  };

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
  console.log(`✓ Manifest: ${path.basename(manifestPath)}`);
  console.log(`  size: ${sizeBytes} bytes`);
  console.log(`  sha256: ${checksum}`);

  await applyRetention(backupDir, retention);
}

async function applyRetention(
  dir: string,
  retention: { keepDaily: number; keepWeekly: number; keepMonthly: number },
) {
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

    const lastDay = dumps.filter((d) => now - d.time!.getTime() < oneDay);

    const weeklyKept = new Set<string>();
    for (let w = 0; w < retention.keepWeekly; w++) {
      const cutoff = now - (w + 1) * 7 * oneDay;
      const cand = dumps.find((d) => d.time!.getTime() < cutoff && !weeklyKept.has(d.file));
      if (cand) weeklyKept.add(cand.file);
    }

    const monthlyKept = new Set<string>();
    for (let m = 0; m < retention.keepMonthly; m++) {
      const cutoff = now - (m + 1) * 30 * oneDay;
      const cand = dumps.find(
        (d) =>
          d.time!.getTime() < cutoff &&
          !monthlyKept.has(d.file) &&
          !weeklyKept.has(d.file),
      );
      if (cand) monthlyKept.add(cand.file);
    }

    const protectedSet = new Set([
      ...lastDay.map((d) => d.file),
      ...weeklyKept,
      ...monthlyKept,
    ]);

    const keepTotal = retention.keepDaily + retention.keepWeekly + retention.keepMonthly;
    for (const d of dumps) {
      const shouldProtect = protectedSet.has(d.file);
      const remainingAfterDelete = dumps.length - toDelete.length;
      if (!shouldProtect && remainingAfterDelete > keepTotal) {
        toDelete.push(d.path);
      }
    }

    for (const p of toDelete) {
      await fs.unlink(p);
      // También borrar el manifest si existe
      const mPath = p + ".manifest.json";
      try {
        await fs.unlink(mPath);
      } catch {
        // ignore
      }
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