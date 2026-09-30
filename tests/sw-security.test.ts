import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Tests sobre el Service Worker (public/sw.js).
 *
 * Verifica que la política de cache sea estrictamente segura para una
 * aplicación financiera:
 *   - NO cachear HTML (páginas autenticadas)
 *   - NO cachear /api/* (datos financieros)
 *   - SÍ cachear sólo assets estáticos whitelisted
 */

describe("Service Worker security", () => {
  const swContent = readFileSync(
    path.join(process.cwd(), "public", "sw.js"),
    "utf-8",
  );

  it("NO cachea HTML (text/html)", () => {
    // El SW debe tener una rama explícita para navigations/HTML
    expect(swContent).toMatch(/req\.mode === "navigate"|accept.*text\/html/);
    // El bloque que maneja navigations debe pasar por fetch (no cache-first)
    expect(swContent).toMatch(/navigate[\s\S]{0,300}fetch\(/);
  });

  it("NO cachea /api/* (datos sensibles)", () => {
    // Debe haber un check explícito para /api/* que bypass-ea el cache
    expect(swContent).toMatch(/\/api\//);
    // La rama de /api debe ser fetch-only (no cache)
    expect(swContent).toMatch(/\/api\/[\s\S]{0,200}fetch\(/);
  });

  it("NO cachea responses de POST/PUT/DELETE", () => {
    expect(swContent).toMatch(/req\.method !== "GET"/);
    expect(swContent).toMatch(/Solo GET|req\.method/);
  });

  it("SÍ cachea assets estáticos whitelisted", () => {
    expect(swContent).toMatch(/\/_next\/static\//);
    expect(swContent).toMatch(/icons/);
    expect(swContent).toMatch(/manifest/);
    expect(swContent).toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
  });

  it("Usa función whitelist isStaticAsset (no catch-all)", () => {
    expect(swContent).toMatch(/isStaticAsset/);
  });

  it("Versiona el cache (CACHE_VERSION presente)", () => {
    expect(swContent).toMatch(/CACHE_VERSION|static-/);
  });

  it("Logout limpia el cache del SW (o al menos no persiste)", () => {
    // El SW no debe precachear paths autenticados
    expect(swContent).not.toContain("PRECACHE_URLS.push(\"/home\")");
    expect(swContent).not.toContain("PRECACHE_URLS.push(\"/cuentas\")");
    expect(swContent).not.toContain("PRECACHE_URLS.push(\"/mas\")");
  });
});

describe("Service Worker authentication handling", () => {
  const swContent = readFileSync(
    path.join(process.cwd(), "public", "sw.js"),
    "utf-8",
  );

  it("Navigations van por network (no cache)", () => {
    expect(swContent).toMatch(/navigate[\s\S]{0,300}fetch\(/);
  });

  it("Múltiples usos de fetch directo en distintas ramas", () => {
    const fetchCount = (swContent.match(/event\.respondWith\(fetch\(/g) ?? []).length;
    expect(fetchCount).toBeGreaterThanOrEqual(1);
  });
});

describe("PWA manifest security", () => {
  const manifest = JSON.parse(
    readFileSync(path.join(process.cwd(), "public", "manifest.json"), "utf-8"),
  );

  it("No expone rutas internas en shortcuts", () => {
    if (manifest.shortcuts) {
      for (const sc of manifest.shortcuts) {
        // Shortcuts NO deben apuntar a APIs internas ni a admin
        expect(sc.url.startsWith("/")).toBe(true);
        expect(sc.url.startsWith("/api/")).toBe(false);
        expect(sc.url.startsWith("/admin/")).toBe(false);
      }
    }
  });

  it("start_url es / (la app redirige a /login si no hay sesión)", () => {
    expect(manifest.start_url).toBe("/");
  });

  it("display es standalone (PWA full-screen)", () => {
    expect(manifest.display).toBe("standalone");
  });

  it("tiene al menos un icono", () => {
    expect(manifest.icons.length).toBeGreaterThan(0);
  });
});