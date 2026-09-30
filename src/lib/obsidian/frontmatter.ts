/**
 * FINORA — YAML frontmatter generation/parsing para archivos del Vault.
 *
 * Usamos un subset manual de YAML para no depender librerías externas.
 * Los valores se serializan con un formato estable (orden de claves estable,
 * quoting explícito cuando hay caracteres speciales).
 */

import crypto from "node:crypto";

const FRONTMATTER_DELIM = "---";

export interface FrontmatterResult {
  body: string;
  data: Record<string, unknown>;
}

/** Serializa un valor JS a un fragmento YAML seguro. */
function yamlValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") {
    // Numbers that round nicely to integer
    if (Number.isInteger(value)) return value.toString();
    return value.toFixed(4);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return "[" + value.map(yamlValue).join(",") + "]";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  // string
  const str = String(value);
  if (str === "") return '""';
  // Quote strings that contain special chars
  if (/[:#\n\r\t]|^\s|\s$|^-|^["']|^[\[\{]/.test(str)) {
    return JSON.stringify(str);
  }
  // Also quote strings that look like booleans or numbers
  if (/^(true|false|null|yes|no)$/i.test(str)) return JSON.stringify(str);
  if (/^-?\d+(\.\d+)?$/.test(str)) return JSON.stringify(str);
  return str;
}

/**
 * Construye el bloque frontmatter YAML con claves ordenadas alfabéticamente
 * para que los diffs sean estables y los checksums determinísticos.
 */
export function buildFrontmatter(data: Record<string, unknown>): string {
  const keys = Object.keys(data).sort();
  const lines = [FRONTMATTER_DELIM];
  for (const key of keys) {
    const value = data[key];
    if (value === undefined) continue;
    lines.push(`${key}: ${yamlValue(value)}`);
  }
  lines.push(FRONTMATTER_DELIM);
  return lines.join("\n");
}

/**
 * Une frontmatter + body en un único string Markdown.
 */
export function buildMarkdown(frontmatter: Record<string, unknown>, body: string): string {
  const fm = buildFrontmatter(frontmatter);
  const trimmedBody = body.trim();
  return `${fm}\n\n${trimmedBody}\n`;
}

export function sha256OfData(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Parsea un archivo Markdown en frontmatter + body.
 * NO usa librería externa — soporta el subset que generamos nosotros.
 *
 * Devuelve `{ body, data }` donde `data` es el objeto plano.
 * Si el archivo no tiene frontmatter, devuelve `{ body: input, data: {} }`.
 */
export function parseMarkdown(input: string): FrontmatterResult {
  if (!input.startsWith(`${FRONTMATTER_DELIM}\n`)) {
    return { body: input, data: {} };
  }
  const endIdx = input.indexOf(`\n${FRONTMATTER_DELIM}\n`);
  if (endIdx === -1) {
    return { body: input, data: {} };
  }
  const fmText = input.slice(FRONTMATTER_DELIM.length + 1, endIdx);
  const body = input.slice(endIdx + FRONTMATTER_DELIM.length + 2);
  const data: Record<string, unknown> = {};
  for (const line of fmText.split("\n")) {
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    const raw = m[2]!;
    data[key] = parseValue(raw);
  }
  return { body, data };
}

function parseValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === "null" || trimmed === "~") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "") return "";
  // Quoted string
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  // Array (simple)
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map(parseValue);
  }
  // Number
  const num = Number(trimmed);
  if (!Number.isNaN(num) && /^-?\d+(\.\d+)?$/.test(trimmed)) return num;
  return trimmed;
}