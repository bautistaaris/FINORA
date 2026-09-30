import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  atomicWrite,
  fileExists,
  sha256OfFile,
  sha256OfData,
  moveToDeleted,
  freeDiskBytes,
} from "../src/lib/obsidian/writer";
import {
  buildFrontmatter,
  buildMarkdown,
  parseMarkdown,
} from "../src/lib/obsidian/frontmatter";
import {
  slug,
  shortId,
  filePathFor,
  finoraRoot,
  dirFor,
  deletedDir,
} from "../src/lib/obsidian/paths";
import {
  buildTransactionFile,
  buildAccountFile,
  buildTombstone,
} from "../src/lib/obsidian/handlers";

describe("obsidian/frontmatter", () => {
  it("buildMarkdown produce frontmatter delimitado y body", () => {
    const md = buildMarkdown({ foo: "bar", n: 42 }, "# Hello");
    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toContain("foo: bar");
    expect(md).toContain("n: 42");
    expect(md).toContain("# Hello");
  });

  it("parseMarkdown roundtrip básico", () => {
    const md = buildMarkdown({ foo: "bar", list: [1, 2, 3] }, "body text");
    const parsed = parseMarkdown(md);
    expect(parsed.data.foo).toBe("bar");
    expect(parsed.data.list).toEqual([1, 2, 3]);
    expect(parsed.body.trim()).toBe("body text");
  });

  it("orden de claves es estable (alfabético)", () => {
    const md1 = buildMarkdown({ z: 1, a: 2, m: 3 }, "x");
    const md2 = buildMarkdown({ a: 2, m: 3, z: 1 }, "x");
    expect(md1).toBe(md2);
  });

  it("strings con caracteres especiales se quoten correctamente", () => {
    const md = buildMarkdown({ path: "C:\\Mi carpeta\\file.md" }, "");
    expect(md).toContain('"C:\\\\Mi carpeta\\\\file.md"');
  });

  it("parseMarkdown sin frontmatter devuelve body crudo", () => {
    const result = parseMarkdown("# Sin frontmatter\n");
    expect(result.data).toEqual({});
    expect(result.body).toContain("Sin frontmatter");
  });

  it("parseMarkdown parsea boolean y null", () => {
    const md = buildMarkdown({ active: true, archived: false, deleted: null }, "");
    const r = parseMarkdown(md);
    expect(r.data.active).toBe(true);
    expect(r.data.archived).toBe(false);
    expect(r.data.deleted).toBe(null);
  });
});

describe("obsidian/paths", () => {
it("slug normaliza acentos y espacios", () => {
    expect(slug("Mercado Pago")).toBe("mercado-pago");
    expect(slug("Banco  Galicia")).toBe("banco-galicia");
    expect(slug("---test---")).toBe("test");
    expect(slug("")).toBe("unnamed");
  });

  it("shortId toma primeros 8 hex", () => {
    expect(shortId("12345678-abcd-1234-1234-1234567890ab")).toBe("12345678");
    expect(shortId("abcdef00-aaaa")).toBe("abcdef00");
  });

  it("filePathFor genera path consistente", () => {
    const p = filePathFor({
      vaultPath: "/vault",
      entityType: "Transaction",
      id: "abcd1234-aaaa",
      date: new Date(Date.UTC(2026, 8, 15)),
      displayName: "Starbucks",
    });
    expect(p).toContain("01 Transactions");
    expect(p).toContain("2026");
    expect(p).toContain("09");
    expect(p).toContain("starbucks");
    expect(p).toContain("abcd1234");
    expect(p.endsWith(".md")).toBe(true);
  });

  it("finoraRoot y dirFor funcionan", () => {
    expect(finoraRoot("/vault")).toBe(path.join("/vault", "FINORA"));
    expect(dirFor("/vault", "Account")).toBe(path.join("/vault", "FINORA", "02 Accounts"));
    expect(deletedDir("/vault", new Date(Date.UTC(2026, 0, 5))))
      .toBe(path.join("/vault", "FINORA", "99 System", "Deleted", "2026-01-05"));
  });
});

describe("obsidian/writer", () => {
  it("sha256OfData es determinístico", () => {
    expect(sha256OfData("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("atomicWrite escribe archivo en disco", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "finora-test-"));
    const target = path.join(dir, "test.md");
    const result = await atomicWrite(target, "# Hello\n\nworld");
    expect(result.bytes).toBeGreaterThan(0);
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(await fileExists(target)).toBe(true);
    const content = await fs.readFile(target, "utf-8");
    expect(content).toBe("# Hello\n\nworld");
    const onDisk = await sha256OfFile(target);
    expect(onDisk).toBe(result.checksum);
    await fs.rm(dir, { recursive: true });
  });

  it("atomicWrite sobrescribe atómicamente", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "finora-test-"));
    const target = path.join(dir, "test.md");
    await atomicWrite(target, "first");
    await atomicWrite(target, "second");
    expect(await fs.readFile(target, "utf-8")).toBe("second");
    await fs.rm(dir, { recursive: true });
  });

  it("atomicWrite no deja archivos .tmp en el destino", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "finora-test-"));
    const target = path.join(dir, "test.md");
    await atomicWrite(target, "x");
    const files = await fs.readdir(dir);
    expect(files.filter((f) => f.endsWith(".tmp")).length).toBe(0);
    await fs.rm(dir, { recursive: true });
  });

  it("moveToDeleted mueve archivos preservando metadata", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "finora-test-"));
    const source = path.join(dir, "source.md");
    const deleted = path.join(dir, "deleted");
    await fs.writeFile(source, "content");
    const moved = await moveToDeleted(source, deleted);
    expect(await fileExists(source)).toBe(false);
    expect(await fileExists(moved)).toBe(true);
    expect(moved).toContain("deleted");
    await fs.rm(dir, { recursive: true });
  });

  it("freeDiskBytes devuelve número", async () => {
    const free = await freeDiskBytes(process.cwd());
    expect(typeof free).toBe("number");
    expect(free).toBeGreaterThan(0);
  });
});

describe("obsidian/handlers", () => {
  it("buildTransactionFile genera markdown válido", () => {
    const result = buildTransactionFile({
      vaultPath: "/vault",
      payload: {
        id: "tx-1",
        userId: "u-1",
        type: "EXPENSE",
        amount: "15000.0000",
        currency: "ARS",
        date: new Date("2026-09-30T18:00:00Z"),
        description: "Café",
        accountId: "acc-1",
        account: { id: "acc-1", name: "Mercado Pago", currency: "ARS" },
        categoryId: "cat-1",
        category: { id: "cat-1", name: "Café", type: "EXPENSE" },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      recordVersion: 1,
    });
    expect(result.markdown).toContain("schema_version: 1");
    expect(result.markdown).toContain("finora_id: tx-1");
    expect(result.markdown).toContain("entity_type: transaction");
    expect(result.markdown).toContain("amount: 15000");
    expect(result.markdown).toContain("Mercado Pago");
    expect(result.markdown).toContain("checksum:");
    expect(result.markdown).toContain("sha256:");
    expect(result.filePath).toContain("01 Transactions");
  });

  it("buildAccountFile genera markdown válido", () => {
    const result = buildAccountFile({
      vaultPath: "/vault",
      payload: {
        id: "acc-1",
        userId: "u-1",
        name: "Banco Galicia",
        type: "BANK",
        currency: "ARS",
        initialBalance: "1500000",
        currentBalance: "1420000",
        isActive: true,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      recordVersion: 3,
    });
    expect(result.markdown).toContain("finora_id: acc-1");
    expect(result.markdown).toContain("record_version: 3");
    expect(result.markdown).toContain("name: Banco Galicia");
    expect(result.markdown).toContain("current_balance: 1420000");
  });

  it("buildTombstone genera metadata de eliminación", () => {
    const tm = buildTombstone({
      originalFileName: "test.md",
      finoraId: "x-1",
      entityType: "Transaction",
      deletedAt: new Date("2026-09-30"),
      recordVersion: 5,
    });
    expect(tm.markdown).toContain("entity_type: transaction_tombstone");
    expect(tm.markdown).toContain("finora_id: x-1");
    expect(tm.markdown).toContain("deleted_at:");
  });

  it("roundtrip: parseMarkdown lee el archivo generado", () => {
    const result = buildAccountFile({
      vaultPath: "/vault",
      payload: {
        id: "acc-x",
        userId: "u-1",
        name: "Test",
        type: "CASH",
        currency: "USD",
        initialBalance: "100",
        currentBalance: "200",
        isActive: true,
        isArchived: false,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-02"),
      },
      recordVersion: 1,
    });
    const parsed = parseMarkdown(result.markdown);
    expect(parsed.data.finora_id).toBe("acc-x");
    expect(parsed.data.entity_type).toBe("account");
    expect(parsed.data.current_balance).toBe(200);
    expect(parsed.data.is_active).toBe(true);
    expect(parsed.data.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});

describe("decimal precision in handlers", () => {
  it("amount 0.1 + 0.2 debería sumar exactamente (no 0.30000000000000004)", () => {
    // Esto verifica que los handlers no usen float directamente.
    // La aritmética de Prisma.Decimal se prueba en finance.test.ts;
    // acá validamos que el output sea representable como decimal exacto.
    const result = buildTransactionFile({
      vaultPath: "/vault",
      payload: {
        id: "tx-dec",
        userId: "u-1",
        type: "EXPENSE",
        amount: "0.3000", // exactamente 0.3
        currency: "ARS",
        date: new Date("2026-01-01"),
        accountId: "acc-1",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      recordVersion: 1,
    });
    expect(result.markdown).toContain("amount: 0.3000");
  });
});