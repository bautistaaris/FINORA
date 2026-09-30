/* eslint-disable no-console */
/**
 * FINORA — PostgreSQL restore via pg_restore
 *
 * Restaura un backup generado por pg_dump --format=custom.
 *
 * Uso:
 *   npm run restore:pg -- --file=G:/backups/finora/finora_xxx.dump
 *   npm run restore:pg -- --file=./backups/finora_xxx.dump --clean
 *
 * ADVERTENCIA: --clean borra los objetos existentes antes de restaurar.
 *              Sin --clean, fallará si los objetos ya existen.
 */

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

async function main() {
  const fileArg = process.argv.find((a) => a.startsWith("--file="));
  if (!fileArg) {
    console.error("✗ Falta --file=<path>");
    console.error("  Uso: npm run restore:pg -- --file=./backups/finora_xxx.dump [--clean]");
    process.exit(1);
  }
  const filePath = fileArg.slice("--file=".length);
  const clean = process.argv.includes("--clean");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("✗ DATABASE_URL no está configurado.");
    process.exit(1);
  }
  const pgRestore = process.env.PG_RESTORE_PATH ?? "pg_restore";

  if (!(await fs.access(filePath).then(() => true).catch(() => false))) {
    console.error(`✗ Backup no encontrado: ${filePath}`);
    process.exit(1);
  }

  console.log(`→ Restore PostgreSQL`);
  console.log(`  From: ${path.basename(filePath)}`);
  console.log(`  Mode: ${clean ? "CLEAN (drop+create)" : "preserve"}`);
  console.log("");
  console.log("⚠ ADVERTENCIA: este comando SOBRESCRIBIRÁ la DB actual.");
  console.log("Escribí 'yes' para continuar:");
  process.stdout.write("> ");
  const answer = await readInput();
  if (answer.trim().toLowerCase() !== "yes") {
    console.log("Abortado.");
    return;
  }

  const args = [
    "--dbname=" + databaseUrl,
    "--no-owner",
    "--no-privileges",
    "--jobs=4",
  ];
  if (clean) args.push("--clean");
  if (clean) args.push("--if-exists");
  args.push(filePath);

  try {
    await exec(pgRestore, args);
    console.log(`✓ Restore completado.`);
  } catch (err: any) {
    console.error(`✗ Error:`, err.message);
    process.exit(1);
  }
}

function readInput(): Promise<string> {
  return new Promise((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf-8");
    const onData = (c: Buffer | string) => {
      const ch = typeof c === "string" ? c : c.toString("utf-8");
      if (ch === "\n" || ch === "\r") {
        process.stdin.removeListener("data", onData);
        resolve(buf);
      } else {
        buf += ch;
      }
    };
    process.stdin.on("data", onData);
    process.stdin.on("end", () => resolve(buf));
    process.stdin.resume();
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});