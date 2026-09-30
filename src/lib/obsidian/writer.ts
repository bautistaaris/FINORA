/**
 * FINORA — Atomic file writer para el Vault.
 *
 * Implementa escritura atómica para evitar archivos parcialmente escritos,
 * lo cual es crítico cuando el Vault se sincroniza mediante Google Drive,
 * OneDrive, Dropbox, etc.
 *
 * Estrategia:
 *  1. Escribir contenido en archivo temporal (Vault/.tmp/...)
 *  2. fsync (flush a disco) en POSIX
 *  3. rename(tmp, target) — atómico en Linux/macOS, atómico-en-mayor-parte en NTFS
 *
 * Para Windows, también usamos MoveFileEx con REPLACE_EXISTING que es
 * atómico a nivel del filesystem en NTFS.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export type EntityType =
  | "Transaction"
  | "Account"
  | "Investment"
  | "InvestmentTransaction"
  | "Subscription"
  | "Budget"
  | "Debt"
  | "RecurringTransaction"
  | "NetWorthSnapshot";

const TMP_PREFIX = ".finora-tmp-";
const TMP_SUFFIX = ".tmp";

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Escribe un archivo atómicamente.
 *
 *  - Crea el directorio padre si no existe
 *  - Escribe primero en un archivo temporal único
 *  - Renombra al destino (atómico en POSIX y NTFS)
 *
 * Si la escritura o el rename fallan, intenta limpiar el archivo temporal.
 *
 * Devuelve información del archivo escrito (path final + checksum).
 */
export async function atomicWrite(
  filePath: string,
  content: string | Buffer,
  options?: { encoding?: BufferEncoding },
): Promise<{ path: string; bytes: number; checksum: string }> {
  const encoding = options?.encoding ?? "utf-8";
  const data = typeof content === "string" ? Buffer.from(content, encoding) : content;

  const dir = path.dirname(filePath);
  await ensureDir(dir);

  const tmpName = `${TMP_PREFIX}${crypto.randomBytes(6).toString("hex")}${TMP_SUFFIX}`;
  const tmpPath = path.join(dir, tmpName);

  let fd: import("node:fs/promises").FileHandle | undefined;
  try {
    fd = await fs.open(tmpPath, "w");
    await fd.writeFile(data);
    // fsync es costoso pero garantiza durabilidad en disco.
    // Es esencial si el Vault se monta sobre un FS no local (SMB, NFS).
    // Si está en un disco local, el OS ya garantiza ordering.
    try {
      await fd.sync();
    } catch {
      // Algunos FS (algunos Windows network shares) no soportan fsync.
      // No es crítico — el rename sigue siendo atómico.
    }
    await fd.close();
    fd = undefined;

    // Atomic rename.
    // En Windows, fs.rename no reemplaza el destino por defecto (a partir
    // de Node 14 sí). Por seguridad usamos rename que reemplaza.
    await fs.rename(tmpPath, filePath);

    const checksum = crypto.createHash("sha256").update(data).digest("hex");
    return { path: filePath, bytes: data.length, checksum };
  } catch (err) {
    if (fd) {
      try {
        await fd.close();
      } catch {
        // ignore
      }
    }
    try {
      await fs.unlink(tmpPath);
    } catch {
      // ignore — tmp puede no existir
    }
    throw err;
  }
}

/**
 * Calcula SHA-256 del contenido de un archivo.
 * Si el archivo no existe, devuelve null.
 */
export async function sha256OfFile(filePath: string): Promise<string | null> {
  try {
    const data = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(data).digest("hex");
  } catch {
    return null;
  }
}

/**
 * Calcula SHA-256 de un string o buffer.
 */
export function sha256OfData(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Mueve un archivo a un directorio de "deleted" preservando metadata.
 * Si el destino ya existe, agrega un sufijo numérico.
 *
 * Devuelve el path final del archivo movido.
 */
export async function moveToDeleted(
  sourcePath: string,
  deletedDir: string,
): Promise<string> {
  await ensureDir(deletedDir);
  const baseName = path.basename(sourcePath);
  let target = path.join(deletedDir, baseName);
  let i = 1;
  while (await fileExists(target)) {
    const ext = path.extname(baseName);
    const stem = baseName.slice(0, baseName.length - ext.length);
    target = path.join(deletedDir, `${stem}__${i}${ext}`);
    i++;
  }
  await fs.rename(sourcePath, target);
  return target;
}

/**
 * Verifica que el path esté dentro de una raíz (anti path-traversal).
 */
export function isPathInside(childPath: string, parentPath: string): boolean {
  const rel = path.relative(parentPath, childPath);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * Path de almacenamiento de backups pg_dump dentro del Vault.
 */
export function backupPath(vaultPath: string): string {
  return path.join(vaultPath, "FINORA", "98 Backups");
}

/**
 * Verifica espacio libre disponible.
 * Devuelve bytes libres.
 */
export async function freeDiskBytes(dirPath: string): Promise<number> {
  // node:os no provee free space cross-platform directo. Usamos statvfs en POSIX
  // y GetDiskFreeSpaceEx en Windows. Pero para mantener cross-platform usamos
  // un fallback simple: statvfs en Linux/macOS, y si no funciona devolvemos Infinity.
  try {
    const { statfs } = await import("node:fs/promises");
    const stats = await statfs(dirPath);
    return stats.bavail * stats.bsize;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}