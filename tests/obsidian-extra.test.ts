import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { buildEntityFile } from "../src/lib/obsidian/handlers";
import { parseMarkdown } from "../src/lib/obsidian/frontmatter";
import { filePathFor } from "../src/lib/obsidian/paths";
import {
  atomicWrite,
  fileExists,
} from "../src/lib/obsidian/writer";

/* eslint-disable @typescript-eslint/no-explicit-any */

describe("obsidian/schema_version enforcement", () => {
  it("FINORA_SCHEMA_VERSION=1 en todos los archivos generados", () => {
    const expectedVersion = 1;
    // Cualquier archivo nuevo debe llevar schema_version: 1
    const result = buildEntityFile({
      vaultPath: "/vault",
      entityType: "Account",
      payload: {
        id: "x",
        userId: "u",
        name: "Test",
        type: "CASH",
        currency: "ARS",
        initialBalance: "0",
        currentBalance: "0",
        isActive: true,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      recordVersion: 1,
    });
    expect(result.markdown).toContain(`schema_version: ${expectedVersion}`);
  });

  it("record_version aparece en el frontmatter", () => {
    const result = buildEntityFile({
      vaultPath: "/vault",
      entityType: "Account",
      payload: {
        id: "x",
        userId: "u",
        name: "Test",
        type: "CASH",
        currency: "ARS",
        initialBalance: "0",
        currentBalance: "0",
        isActive: true,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      recordVersion: 42,
    });
    expect(result.markdown).toContain("record_version: 42");
  });

  it("checksum está presente y empieza con sha256:", () => {
    const result = buildEntityFile({
      vaultPath: "/vault",
      entityType: "Account",
      payload: {
        id: "x",
        userId: "u",
        name: "Test",
        type: "CASH",
        currency: "ARS",
        initialBalance: "0",
        currentBalance: "0",
        isActive: true,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      recordVersion: 1,
    });
    const { data } = parseMarkdown(result.markdown);
    expect(String(data.checksum)).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("fronmatter keys ordenadas alfabéticamente", () => {
    const result = buildEntityFile({
      vaultPath: "/vault",
      entityType: "Account",
      payload: {
        id: "x",
        userId: "u",
        name: "Test",
        type: "CASH",
        currency: "ARS",
        initialBalance: "0",
        currentBalance: "0",
        isActive: true,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      recordVersion: 1,
    });
    const { data } = parseMarkdown(result.markdown);
    const keys = Object.keys(data);
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
  });
});

describe("obsidian/path safety (anti path-traversal)", () => {
  it("filePathFor no escapa del directorio de la entidad", () => {
    const p = filePathFor({
      vaultPath: "/vault",
      entityType: "Account",
      id: "../../../etc/pass",
      date: new Date(),
      displayName: "evil",
    });
    // Usar path.join(path.sep) para comparar cross-platform.
    // En Windows:   \vault\FINORA\02 Accounts\...
    // En Linux:     /vault/FINORA/02 Accounts/...
    const expectedPrefix = path.join("/vault", "FINORA", "02 Accounts");
    expect(p.startsWith(expectedPrefix)).toBe(true);
    // El path NO debe contener secuencias de escape
    expect(p).not.toContain("..");
  });

  it("filePathFor preserva IDs seguros con UUID válido", () => {
    const p = filePathFor({
      vaultPath: "/vault",
      entityType: "Account",
      id: "abc12345-valid-uuid",
      date: new Date("2026-01-15"),
      displayName: "Banco Galicia",
    });
    const expectedPrefix = path.join("/vault", "FINORA", "02 Accounts");
    expect(p.startsWith(expectedPrefix)).toBe(true);
    expect(p).toContain("abc12345");
    expect(p.endsWith(".md")).toBe(true);
  });

  it("transacciones se organizan por YYYY/MM", () => {
    const p = filePathFor({
      vaultPath: "/vault",
      entityType: "Transaction",
      id: "tx-1",
      date: new Date(Date.UTC(2026, 8, 15)),
      displayName: "Test",
    });
    expect(p).toContain("01 Transactions");
    expect(p).toContain("2026");
    expect(p).toContain("09");
  });
});

describe("obsidian/decimal precision in YAML serialization", () => {
  it("importes monetarios se serializan como string exacto (no float)", () => {
    // 0.1 + 0.2 = 0.3 exactamente en Prisma.Decimal
    // En float JS = 0.30000000000000004 (pérdida de precisión)
    const result = buildEntityFile({
      vaultPath: "/vault",
      entityType: "Account",
      payload: {
        id: "x",
        userId: "u",
        name: "Test",
        type: "CASH",
        currency: "ARS",
        initialBalance: "0.3000", // string exacto
        currentBalance: "12345.6700",
        isActive: true,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      recordVersion: 1,
    });
    expect(result.markdown).toContain("current_balance: 12345.6700");
    expect(result.markdown).toContain("initial_balance: 0.3000");
    // NUNCA debería verse el float drift
    expect(result.markdown).not.toContain("0.30000000000000004");
    expect(result.markdown).not.toContain("12345.66999");
  });
});

describe("obsidian/atomic write doesn't leave temp files", () => {
  it("atomicWrite no deja archivos .tmp en el directorio", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "finora-atomic-"));
    const target = path.join(dir, "test.md");
    await atomicWrite(target, "# Test content");
    const files = await fs.readdir(dir);
    const tmps = files.filter((f) => f.endsWith(".tmp"));
    expect(tmps.length).toBe(0);
    await fs.rm(dir, { recursive: true });
  });

  it("atomicWrite es idempotente (re-escribir varias veces)", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "finora-atomic-"));
    const target = path.join(dir, "test.md");
    await atomicWrite(target, "first");
    await atomicWrite(target, "second");
    await atomicWrite(target, "third");
    const content = await fs.readFile(target, "utf-8");
    expect(content).toBe("third");
    await fs.rm(dir, { recursive: true });
  });

  it("atomicWrite crea el directorio padre si no existe", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "finora-atomic-"));
    const target = path.join(dir, "subdir", "nested", "test.md");
    await atomicWrite(target, "nested content");
    expect(await fileExists(target)).toBe(true);
    await fs.rm(dir, { recursive: true });
  });
});

describe("obsidian/worker integration (skipped: requires DB)", () => {
  it.skip("processBatch con dryRun no escribe archivos (requiere DB activa)", () => {
    // Este test requiere una DB Postgres real.
    // Lo corremos via integration test real en tests/integration/
    // o manualmente via: npm run sync:once --vault=/tmp/vault
    expect(true).toBe(true);
  });
});

describe("obsidian/parseMarkdown helper used directly", () => {
  it("parseMarkdown devuelve data y body separados", () => {
    const { data, body } = parseMarkdown("---\nfoo: bar\n---\nbody text");
    expect(data.foo).toBe("bar");
    expect(body.trim()).toBe("body text");
  });
});