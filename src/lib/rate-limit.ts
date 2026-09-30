import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

/**
 * Rate limiter persistente en DB (low-overhead).
 *
 * Para una app single-user, lo crítico es:
 *   1. Login brute force (muchos intentos con password incorrecta)
 *   2. Signup flood (en este caso NO hay signup, pero protegemos /api/bootstrap)
 *
 * Reglas:
 *   - 5 intentos fallidos / 15 min por email → bloqueo 15 min
 *   - 30 intentos fallidos / 15 min por IP → bloqueo 1 hora
 *   - Limpieza de de errores antiguos: opportunistic (al consultar se borran los viejos)
 */

export const RATE = {
  MAX_FAILURES_PER_EMAIL: 5,
  MAX_FAILURES_PER_IP: 30,
  WINDOW_MS: 15 * 60 * 1000, // 15 min
  LOCKOUT_MS: 15 * 60 * 1000, // 15 min
  IP_LOCKOUT_MS: 60 * 60 * 1000, // 1 hora
} as const;

export async function recordAttempt(
  email: string,
  ip: string | null,
  success: boolean,
): Promise<void> {
  await prisma.loginAttempt.create({
    data: {
      email: email.toLowerCase().trim(),
      ip: ip ?? null,
      success,
    },
  });
}

export async function isEmailLockedOut(email: string): Promise<boolean> {
  const since = new Date(Date.now() - RATE.WINDOW_MS);
  const failures = await prisma.loginAttempt.count({
    where: {
      email: email.toLowerCase().trim(),
      success: false,
      createdAt: { gte: since },
    },
  });
  return failures >= RATE.MAX_FAILURES_PER_EMAIL;
}

export async function isIpLockedOut(ip: string): Promise<boolean> {
  const since = new Date(Date.now() - RATE.WINDOW_MS);
  const failures = await prisma.loginAttempt.count({
    where: {
      ip,
      success: false,
      createdAt: { gte: since },
    },
  });
  return failures >= RATE.MAX_FAILURES_PER_IP;
}

/**
 * Helper que limpia intentos antiguos. Llamar al final del handler.
 */
export async function cleanupOldAttempts(): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h
  await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: cutoff } } });
}

/**
 * Helper para obtener la IP del cliente. En Vercel viene en x-forwarded-for.
 */
export function getClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? "unknown";
  const real = headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}