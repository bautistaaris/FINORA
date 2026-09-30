/**
 * FINORA — Obsidian Vault path resolver.
 *
 * Genera rutas determinísticas y reverse-lookup-safe dentro del Vault.
 *
 * IMPORTANTE: todas las rutas son relativas a OBSIDIAN_VAULT_PATH.
 * Nunca hardcodear rutas absolutas fuera de este módulo.
 *
 * Estructura del directorio FINORA dentro del Vault:
 *
 *   FINORA/
 *     00 Dashboard/
 *     01 Transactions/{YYYY}/{MM}/
 *     02 Accounts/
 *     03 Investments/
 *     04 Subscriptions/
 *     05 Budgets/{YYYY-MM}/
 *     06 Debts/
 *     07 Recurring/
 *     08 Net Worth/{YYYY-MM}/
 *     09 Reports/Monthly/{YYYY-MM}/
 *     90 Exports/{YYYY-MM-DD}/
 *     99 System/
 *       Deleted/{YYYY-MM-DD}/
 *       sync-manifest.json
 */

import path from "node:path";

export const FINORA_SCHEMA_VERSION = 1;
export const FINORA_VAULT_SUBDIR = "FINORA";

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

const SAFE_NAME = /[^a-zA-Z0-9-_]/g;

/**
 * Slug seguro para nombres de archivo (sin espacios, sin caracteres especiales).
 */
export function slug(input: string, maxLength = 40): string {
  const cleaned = input.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return cleaned
    .replace(SAFE_NAME, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, maxLength)
    || "unnamed";
}

/**
 * Sufijo corto del UUID para nombres de archivo (8 chars).
 * NO usar como identificador — sólo para evitar colisiones en el filesystem.
 */
export function shortId(id: string, length = 8): string {
  return id.replace(/-/g, "").slice(0, length).toLowerCase();
}

/**
 * Devuelve la raíz de FINORA dentro del Vault.
 * Lanza si OBSIDIAN_VAULT_PATH no está configurado.
 */
export function finoraRoot(vaultPath: string): string {
  if (!vaultPath) {
    throw new Error("OBSIDIAN_VAULT_PATH no está configurado");
  }
  return path.join(vaultPath, FINORA_VAULT_SUBDIR);
}

/**
 * Devuelve el directorio para una entidad específica.
 */
export function dirFor(vaultPath: string, entityType: EntityType): string {
  const root = finoraRoot(vaultPath);
  switch (entityType) {
    case "Transaction":
      return path.join(root, "01 Transactions");
    case "Account":
      return path.join(root, "02 Accounts");
    case "Investment":
      return path.join(root, "03 Investments");
    case "InvestmentTransaction":
      return path.join(root, "03 Investments", "_transactions");
    case "Subscription":
      return path.join(root, "04 Subscriptions");
    case "Budget":
      return path.join(root, "05 Budgets");
    case "Debt":
      return path.join(root, "06 Debts");
    case "RecurringTransaction":
      return path.join(root, "07 Recurring");
    case "NetWorthSnapshot":
      return path.join(root, "08 Net Worth");
  }
}

/**
 * Devuelve el directorio de transacciones para una fecha específica.
 */
export function transactionsDirFor(vaultPath: string, date: Date): string {
  const yyyy = date.getUTCFullYear().toString().padStart(4, "0");
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  return path.join(dirFor(vaultPath, "Transaction"), yyyy, mm);
}

/**
 * Construye el nombre del archivo Markdown para una entidad.
 * El nombre incluye el UUID corto para evitar colisiones si el slug cambia.
 */
export function fileNameFor(
  vaultPath: string,
  entityType: EntityType,
  id: string,
  date: Date,
  displayName: string,
): string {
  const idShort = shortId(id);
  switch (entityType) {
    case "Transaction": {
      const yyyy = date.getUTCFullYear().toString().padStart(4, "0");
      const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
      const dd = date.getUTCDate().toString().padStart(2, "0");
      const slugName = slug(displayName);
      return `${yyyy}-${mm}-${dd}__${slugName}__${idShort}.md`;
    }
    case "InvestmentTransaction": {
      const yyyy = date.getUTCFullYear().toString().padStart(4, "0");
      const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
      const dd = date.getUTCDate().toString().padStart(2, "0");
      const slugName = slug(displayName);
      return `${yyyy}-${mm}-${dd}__${slugName}__${idShort}.md`;
    }
    case "Account": {
      const slugName = slug(displayName);
      return `${slugName}__${idShort}.md`;
    }
    case "Investment": {
      const slugName = slug(displayName);
      return `${slugName}__${idShort}.md`;
    }
    case "Subscription": {
      const slugName = slug(displayName);
      return `${slugName}__${idShort}.md`;
    }
    case "Budget": {
      const yyyy = date.getUTCFullYear().toString().padStart(4, "0");
      const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
      const slugName = slug(displayName);
      return `${yyyy}-${mm}__${slugName}__${idShort}.md`;
    }
    case "Debt": {
      const slugName = slug(displayName);
      return `${slugName}__${idShort}.md`;
    }
    case "RecurringTransaction": {
      const slugName = slug(displayName);
      return `${slugName}__${idShort}.md`;
    }
    case "NetWorthSnapshot": {
      const yyyy = date.getUTCFullYear().toString().padStart(4, "0");
      const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
      return `${yyyy}-${mm}__networth__${idShort}.md`;
    }
  }
}

/**
 * Path completo del archivo para una entidad.
 */
export function filePathFor(args: {
  vaultPath: string;
  entityType: EntityType;
  id: string;
  date: Date;
  displayName: string;
}): string {
  const { vaultPath, entityType, id, date, displayName } = args;
  if (entityType === "Transaction") {
    return path.join(
      transactionsDirFor(vaultPath, date),
      fileNameFor(vaultPath, entityType, id, date, displayName),
    );
  }
  if (entityType === "InvestmentTransaction") {
    return path.join(
      dirFor(vaultPath, "InvestmentTransaction"),
      fileNameFor(vaultPath, entityType, id, date, displayName),
    );
  }
  if (entityType === "Budget") {
    return path.join(
      path.join(dirFor(vaultPath, "Budget"), `${date.getUTCFullYear()}-${(date.getUTCMonth() + 1).toString().padStart(2, "0")}`),
      fileNameFor(vaultPath, entityType, id, date, displayName),
    );
  }
  return path.join(
    dirFor(vaultPath, entityType),
    fileNameFor(vaultPath, entityType, id, date, displayName),
  );
}

/**
 * Path del directorio Deleted para una fecha.
 */
export function deletedDir(vaultPath: string, date: Date): string {
  const yyyy = date.getUTCFullYear().toString().padStart(4, "0");
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = date.getUTCDate().toString().padStart(2, "0");
  return path.join(finoraRoot(vaultPath), "99 System", "Deleted", `${yyyy}-${mm}-${dd}`);
}