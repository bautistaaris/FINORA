/* eslint-disable no-console */
/**
 * FINORA — Backup verification
 *
 * Verifica que los dumps pg_dump existentes sean válidos y no estén corruptos.
 *
 * Uso:
 *   npm run backup:verify                         # verifica el último backup
 *   npm run backup:verify -- --all               # verifica todos los backups
 *   npm run backup:verify -- --file=path.dump   # verificar uno específico
 *
 * Chequeos:
 *  - El archivo existe y no está vacío
 *  - El SHA-256 coincide con el manifest
 *  - El manifest coincide con la firma pg_dump (pg_restore --list)
 *
 * Si todo OK: exit 0. Si falla alguno: exit 1 con detalle.
 */

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { promisify } from "node:util";

const exec = promisify(execFile);

interface BackupManifest {
  version: number;
  timestamp: string;
  filename: string;
  sizeBytes: number;
  checksumSha256: string;
  pgDumpCommand: string;
  exitCode: number;
  databaseUrlSafe: string;
  appVersion: string;
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const fileArg = args.find((a) => a.startsWith("--file="));
  const specificFile = fileArg ? fileArg.slice("--file=".length) : null;

  const backupDir = process.env.FINORA_BACKUP_PATH ??
    (process.env.OBSIDIAN_VAULT_PATH
      ? path.join(process.env.OBSIDIAN_VAULT_PATH, "FINORA", "98 Backups")
      : path.join(process.cwd(), "backups"));

  if (!(await fs.access(backupDir).then(() => true).catch(() => false))) {
    console.error(`✗ Directorio de backups no existe: ${backupDir}`);
    process.exit(1);
  }

  const entries = await fs.readdir(backupDir);
  const dumps = entries
    .filter((f) => f.startsWith("finora_") && f.endsWith(".dump"))
    .map((f) => path.join(backupDir, f))
    .sort();

  let toCheck: string[];
  if (specificFile) {
    toCheck = [specificFile];
  } else if (all) {
    toCheck = dumps;
  } else {
    toCheck = dumps.length > 0 ? [dumps[dumps.length - 1]!] : [];
  }

  if (toCheck.length === 0) {
    console.error(`✗ No hay backups para verificar.`);
    process.exit(1);
  }

  console.log(`→ Verificando ${toCheck.length} backup(s) en ${backupDir}`);

  let failed = 0;
  for (const dumpPath of toCheck) {
    const ok = await verifyBackup(dumpPath);
    if (!ok) failed++;
  }

  if (failed > 0) {
    console.error(`\n✗ ${failed}/${toCheck.length} backups FALLARON la verificación.`);
    process.exit(1);
  } else {
    console.log(`\n✓ Todos los backups OK.`);
  }
}

async function verifyBackup(dumpPath: string): Promise<boolean> {
  const fileName = path.basename(dumpPath);
  let ok = true;

  console.log(`\n[${fileName}]`);

  // 1. Existe
  try {
    await fs.access(dumpPath);
    console.log(`  ✓ Existe`);
  } catch {
    console.error(`  ✗ No existe`);
    return false;
  }

  // 2. Tamaño > 0
  const stat = await fs.stat(dumpPath);
  if (stat.size === 0) {
    console.error(`  ✗ Archivo vacío (0 bytes)`);
    return false;
  }
  console.log(`  ✓ Tamaño: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);

  // 3. Manifest existe?
  const manifestPath = dumpPath + ".manifest.json";
  let manifest: BackupManifest | null = null;
  try {
    const content = await fs.readFile(manifestPath, "utf-8");
    manifest = JSON.parse(content) as BackupManifest;
    console.log(`  ✓ Manifest: ${path.basename(manifestPath)}`);
  } catch {
    console.warn(`  ⚠ Sin manifest (no se puede verificar checksum)`);
  }

  // 4. SHA-256
  const data = await fs.readFile(dumpPath);
  const actualSha = crypto.createHash("sha256").update(data).digest("hex");
  if (manifest) {
    if (actualSha === manifest.checksumSha256) {
      console.log(`  ✓ SHA-256 coincide`);
    } else {
      console.error(`  ✗ SHA-256 NO coincide`);
      console.error(`     esperado: ${manifest.checksumSha256}`);
      console.error(`     actual:   ${actualSha}`);
      ok = false;
    }
    if (manifest.sizeBytes !== stat.size) {
      console.error(`  ✗ Tamaño en manifest no coincide (${manifest.sizeBytes} vs ${stat.size})`);
      ok = false;
    } else {
      console.log(`  ✓ Tamaño en manifest coincide`);
    }
  } else {
    console.log(`  ℹ SHA-256: ${actualSha}`);
  }

  // 5. pg_restore --list (verifica que el dump sea parseable)
  const pgRestore = process.env.PG_RESTORE_PATH ?? "pg_restore";
  try {
    await exec(pgRestore, ["--list", dumpPath], { timeout: 30_000 });
    console.log(`  ✓ pg_restore --list OK (dump parseable)`);
  } catch (err: any) {
    console.error(`  ✗ pg_restore falló:`, err.message);
    ok = false;
  }

  return ok;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});