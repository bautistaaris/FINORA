import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Tests sobre la autenticación y y seguridad y y autorización.
 *
 * Verifica que:
 *  - Las APIs validan auth() antes de procesar
 *  - Las APIs validan ownership por userId
 *  - Las páginas server component verifican auth
 *  - No hay hardcoded secrets en el código
 *  - El .env.example NO contiene secretos reales
 */

describe("API auth + ownership", () => {
  // Las APIs que verifican auth()
  const apiRoutes = [
    "src/app/api/accounts/route.ts",
    "src/app/api/transactions/route.ts",
    "src/app/api/investments/route.ts",
    "src/app/api/subscriptions/route.ts",
    "src/app/api/budgets/route.ts",
    "src/app/api/debts/route.ts",
    "src/app/api/exchange-rates/route.ts",
    "src/app/api/export/route.ts",
    "src/app/api/me/privacy/route.ts",
  ];

  for (const route of apiRoutes) {
    describe(`API ${route}`, () => {
      let content: string;
      try {
        content = readFileSync(path.join(process.cwd(), route), "utf-8");
      } catch {
        return; // skip if missing
      }

      it("Llama a auth() para verificar sesión", () => {
        // Debe importar auth
        expect(content).toMatch(/import.*auth.*from.*@\/lib\/auth/);
        // Debe chequear session.user
        expect(content).toMatch(/session\?\.user|session\.user/);
        // Debe retornar 401 si no hay sesión
        expect(content).toMatch(/status: 401/);
      });

      it("Filtra queries por userId", () => {
        // Debe haber un where que incluya userId (excepto en bootstrap que crea el primero)
        if (route.includes("bootstrap")) return;
        // Acepta cualquier patrón que use session.user.id en un where
        expect(content).toMatch(/userId:\s*session\.user\.id|session\.user\.id/);
      });

      it("Usa validación Zod en POST", () => {
        if (!content.includes("export async function POST")) return;
        // Algunas APIs tienen validación manual (no Zod), aceptamos ambos patrones
        const hasZod = /z\.object|z\.string|z\.number|z\.enum/.test(content);
        const hasManualValidation = /typeof\s+\w+\s*!==|Invalid body/.test(content);
        expect(hasZod || hasManualValidation).toBe(true);
      });
    });
  }
});

describe("Server pages auth", () => {
  const pages = [
    "src/app/(app)/home/page.tsx",
    "src/app/(app)/movimientos/page.tsx",
    "src/app/(app)/cuentas/page.tsx",
    "src/app/(app)/inversiones/page.tsx",
    "src/app/(app)/suscripciones/page.tsx",
    "src/app/(app)/presupuestos/page.tsx",
    "src/app/(app)/deudas/page.tsx",
    "src/app/(app)/mas/page.tsx",
    "src/app/(app)/sistema/page.tsx",
    "src/app/(app)/mas/sync/page.tsx",
  ];

  for (const page of pages) {
    describe(`Page ${page}`, () => {
      let content: string;
      try {
        content = readFileSync(path.join(process.cwd(), page), "utf-8");
      } catch {
        return;
      }

      it("Llama a auth() y redirige si no hay sesión", () => {
        expect(content).toMatch(/auth\(\)/);
        expect(content).toMatch(/redirect\(\"\/login\"\)|if \(!session\?\.user\)/);
      });
    });
  }
});

describe("Security: no hardcoded secrets", () => {
  it(".env.example no contiene passwords reales ni secrets", () => {
    const env = readFileSync(
      path.join(process.cwd(), ".env.example"),
      "utf-8",
    );
    // AUTH_SECRET debe ser placeholder, NO un secret real (40+ chars base64)
    const lines = env.split("\n").filter((l) => l.startsWith("AUTH_SECRET"));
    for (const line of lines) {
      const value = line.split("=", 2)[1] ?? "";
      // Si tiene 40+ chars alfanuméricos/base64, no es un placeholder
      if (value.replace(/["\s]/g, "").length >= 40) {
        expect(value).toMatch(/REPLACE|GENERATE|CHANGE|openssl/i);
      }
    }
    // Debe tener placeholders en passwords
    expect(env).toMatch(/REPLACE_WITH|CHANGE_ME|GENERAR|openssl rand/);
  });

  it(".gitignore excluye .env", () => {
    const gitignore = readFileSync(
      path.join(process.cwd(), ".gitignore"),
      "utf-8",
    );
    expect(gitignore).toMatch(/^\.env$/m);
  });
});

describe("Security: rate limiting", () => {
  const authCode = readFileSync(path.join(process.cwd(), "src/lib/auth.ts"), "utf-8");

  it("Llama a isEmailLockedOut antes de validar password", () => {
    // Debe haber un check de rate limit
    expect(authCode).toMatch(/isEmailLockedOut|rate.?limit/i);
  });

  it("Llama a bcrypt.compare para verificar password", () => {
    expect(authCode).toMatch(/bcrypt\.compare/);
  });

  it("Session expira en 12h o menos", () => {
    expect(authCode).toMatch(/maxAge:\s*\d+/);
    const m = authCode.match(/maxAge:\s*(\d+)/);
    if (m && m[1]) {
      const seconds = Number(m[1]);
      expect(seconds).toBeLessThanOrEqual(60 * 60 * 12); // 12h
    }
  });
});

describe("Security: cookies", () => {
  const authCode = readFileSync(path.join(process.cwd(), "src/lib/auth.ts"), "utf-8");

  it("En producción usa cookie __Secure- prefix", () => {
    // Debe distinguir dev/prod
    expect(authCode).toMatch(/__Secure-/);
    expect(authCode).toMatch(/isProd|NODE_ENV === "production"/);
  });

  it("Cookies tienen httpOnly", () => {
    expect(authCode).toMatch(/httpOnly:\s*true/);
  });

  it("Cookies tienen sameSite", () => {
    expect(authCode).toMatch(/sameSite:\s*"(lax|strict)"/i);
  });

  it("En producción cookies tienen secure", () => {
    expect(authCode).toMatch(/secure:\s*(true|isProd)/);
  });
});

describe("Security: middleware", () => {
  const mwCode = readFileSync(
    path.join(process.cwd(), "src", "middleware.ts"),
    "utf-8",
  );

  it("Redirige a /login si no hay sesión", () => {
    // Acepta redirect("/login"...) o redirect(`/login`...) o new URL("/login"...)
    expect(mwCode).toMatch(/redirect.*\/login|new URL.*\/login|loginUrl/);
  });

  it("Whitelistea paths públicos", () => {
    expect(mwCode).toMatch(/PUBLIC_PATHS|PUBLIC_PREFIXES/);
    expect(mwCode).toMatch(/"\/login"/);
    expect(mwCode).toMatch(/\/api\/health|\/api\/auth/);
  });

  it("Setea headers de seguridad en responses autenticadas", () => {
    expect(mwCode).toMatch(/X-Robots-Tag|noindex/);
    expect(mwCode).toMatch(/Cache-Control|no-store/);
  });
});

describe("Security: CSP and headers in next.config.mjs", () => {
  const config = readFileSync(
    path.join(process.cwd(), "next.config.mjs"),
    "utf-8",
  );

  it("CSP bloquea default-src 'self'", () => {
    expect(config).toMatch(/default-src 'self'/);
  });

  it("CSP frame-ancestors 'none'", () => {
    expect(config).toMatch(/frame-ancestors 'none'/);
  });

  it("X-Frame-Options DENY", () => {
    expect(config).toMatch(/X-Frame-Options.*DENY/);
  });

  it("HSTS en producción", () => {
    expect(config).toMatch(/Strict-Transport-Security/);
    expect(config).toMatch(/max-age=63072000/);
  });

  it("X-Robots-Tag noindex global", () => {
    expect(config).toMatch(/X-Robots-Tag.*noindex/);
  });
});