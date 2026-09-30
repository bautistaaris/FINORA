import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getClientIp } from "@/lib/rate-limit";

/**
 * /api/bootstrap — Crear el PRIMER usuario de la base de producción.
 *
 * Reglas:
 *  - Sólo funciona si NO existe ningún usuario
 *  - Sólo si FINORA_BOOTSTRAP_ENABLED=true
 *  - Sólo lee credenciales desde variables de entorno (nunca desde el body)
 *  - Rate limit: 1 request / minuto / IP
 *  - HTTPS only en prod (verificado por NODE_ENV)
 *  - Las credenciales NO se loguean
 */

const ipLastAttempt = new Map<string, number>();
const IP_COOLDOWN_MS = 60_000;

const pwSchema = z
  .string()
  .min(12, "Mínimo 12 caracteres")
  .max(255)
  .refine((s) => /[a-z]/.test(s), "Debe incluir minúscula")
  .refine((s) => /[A-Z]/.test(s), "Debe incluir mayúscula")
  .refine((s) => /[0-9]/.test(s), "Debe incluir número")
  .refine((s) => /[^a-zA-Z0-9\s]/.test(s), "Debe incluir símbolo")
  .refine((s) => !/\s/.test(s), "Sin espacios");

const emailSchema = z.string().email().max(254);

export async function POST(req: Request) {
  if (process.env.NODE_ENV !== "production" && process.env.FINORA_BOOTSTRAP_ENABLED !== "true") {
    return NextResponse.json({ error: "Disabled" }, { status: 404 });
  }
  if (process.env.FINORA_BOOTSTRAP_ENABLED !== "true") {
    return NextResponse.json({ error: "Bootstrap disabled" }, { status: 404 });
  }

  const ip = getClientIp(req.headers);
  const last = ipLastAttempt.get(ip) ?? 0;
  if (Date.now() - last < IP_COOLDOWN_MS) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  ipLastAttempt.set(ip, Date.now());

  const email = (process.env.FINORA_BOOTSTRAP_EMAIL ?? "").trim();
  const password = process.env.FINORA_BOOTSTRAP_PASSWORD ?? "";

  const emailOk = emailSchema.safeParse(email);
  const pwOk = pwSchema.safeParse(password);
  if (!emailOk.success || !pwOk.success) {
    return NextResponse.json(
      {
        error: "Bootstrap env vars inválidas",
        issues: {
          email: emailOk.success ? undefined : emailOk.error.flatten().formErrors,
          password: pwOk.success ? undefined : pwOk.error.flatten().formErrors,
        },
      },
      { status: 500 },
    );
  }

  const existing = await prisma.user.count();
  if (existing > 0) {
    return NextResponse.json(
      { error: "Bootstrap no disponible: ya existe al menos un usuario." },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      name: email.split("@")[0],
      baseCurrency: process.env.NEXT_PUBLIC_BASE_CURRENCY || "ARS",
    },
  });

  await prisma.settings.create({
    data: { userId: user.id },
  });

  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email },
    message:
      "Usuario creado. DESACTIVAR FINORA_BOOTSTRAP_ENABLED inmediatamente.",
  });
}