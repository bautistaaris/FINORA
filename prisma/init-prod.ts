/* eslint-disable no-console */
/**
 * FINORA — Inicialización segura del primer usuario en PRODUCCIÓN
 *
 * Procedimiento:
 *   1. Configurar vars de entorno:
 *        FINORA_BOOTSTRAP_EMAIL=tu@email.com
 *        FINORA_BOOTSTRAP_PASSWORD=<contraseña fuerte, mín 12 chars>
 *        FINORA_BOOTSTRAP_ENABLED=true
 *   2. Hacer deploy a Vercel
 *   3. Ejecutar una sola vez:
 *        curl -X POST https://finora.tudominio.com/api/bootstrap
 *      ó si lo querés correr local antes del deploy:
 *        npm run init-prod
 *   4. DESACTIVAR inmediatamente:
 *        FINORA_BOOTSTRAP_ENABLED=false   (en Vercel env vars)
 *
 * SEGURIDAD:
 *  - La contraseña NUNCA debe quedar en logs ni en el repositorio
 *  - El endpoint /api/bootstrap sólo funciona si NO existe ningún usuario y
 *    si FINORA_BOOTSTRAP_ENABLED=true
 *  - Rate limit: 1 request por minuto por IP
 *  - Valida longitud mínima y complejidad de contraseña
 */
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const prisma = new PrismaClient();

const MIN_PASSWORD_LENGTH = 12;

function validatePassword(pw: string): string | null {
  if (pw.length < MIN_PASSWORD_LENGTH)
    return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (!/[a-z]/.test(pw)) return "Debe incluir al menos una minúscula.";
  if (!/[A-Z]/.test(pw)) return "Debe incluir al menos una mayúscula.";
  if (!/[0-9]/.test(pw)) return "Debe incluir al menos un número.";
  if (!/[^a-zA-Z0-9]/.test(pw)) return "Debe incluir al menos un símbolo.";
  if (/\s/.test(pw)) return "No puede contener espacios.";
  return null;
}

function validateEmail(email: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Email inválido.";
  if (email.length > 254) return "Email demasiado largo.";
  return null;
}

async function prompt(question: string, hidden = false): Promise<string> {
  if (!hidden) {
    const rl = readline.createInterface({ input, output });
    const answer = await rl.question(question);
    rl.close();
    return answer.trim();
  }
  // Simple "hidden" prompt via raw mode (no echo)
  return new Promise((resolve) => {
    let buf = "";
    process.stdout.write(question);
    const wasRaw = (process.stdin as any).isRaw;
    if (process.stdin.isTTY) (process.stdin as any).setRawMode?.(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const onData = (ch: string) => {
      if (ch === "\n" || ch === "\r" || ch === "\u0004") {
        process.stdin.removeListener("data", onData);
        if (process.stdin.isTTY) (process.stdin as any).setRawMode?.(Boolean(wasRaw));
        process.stdin.pause();
        process.stdout.write("\n");
        resolve(buf);
      } else if (ch === "\u0003") {
        process.exit(1);
      } else if (ch === "\u007f" || ch === "\b") {
        if (buf.length > 0) {
          buf = buf.slice(0, -1);
          process.stdout.write("\b \b");
        }
      } else {
        buf += ch;
        process.stdout.write("*");
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  console.log("\n=== FINORA — Inicialización de usuario de producción ===\n");

  const envEmail = process.env.FINORA_BOOTSTRAP_EMAIL?.trim();
  const envPassword = process.env.FINORA_BOOTSTRAP_PASSWORD;

  let email = envEmail ?? "";
  let password = envPassword ?? "";

  if (!email) {
    email = await prompt("Email del usuario: ");
  } else {
    console.log(`Email (de env): ${email}`);
  }

  if (!password) {
    password = await prompt("Contraseña (mín 12 chars, A-z-0-símbolo): ", true);
    const confirm = await prompt("Repetir contraseña: ", true);
    if (password !== confirm) {
      console.error("✗ Las contraseñas no coinciden.");
      process.exit(1);
    }
  }

  const emailErr = validateEmail(email);
  if (emailErr) {
    console.error(`✗ ${emailErr}`);
    process.exit(1);
  }
  const pwErr = validatePassword(password);
  if (pwErr) {
    console.error(`✗ ${pwErr}`);
    process.exit(1);
  }

  const existing = await prisma.user.count();
  if (existing > 0) {
    console.error(
      `✗ Ya existen ${existing} usuario(s) en la base. Este script sólo sirve para el bootstrap inicial.`,
    );
    process.exit(1);
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
    data: {
      userId: user.id,
      baseCurrency: process.env.NEXT_PUBLIC_BASE_CURRENCY || "ARS",
      privacyModeDefault: false,
      notificationsEnabled: false,
      biometricEnabled: false,
    },
  });

  console.log(
    `\n✓ Usuario creado: ${user.email}\n` +
      `  ID: ${user.id}\n\n` +
      `→ Próximos pasos:\n` +
      `  1. Logueate con esas credenciales en https://tu-dominio.com/login\n` +
      `  2. DESACTIVAR el bootstrap: FINORA_BOOTSTRAP_ENABLED=false\n` +
      `  3. NUNCA commitees la contraseña al repo.\n`,
  );
}

main()
.catch((e) => {
  console.error(e);
  process.exit(1);
})
.finally(async () => {
  await prisma.$disconnect();
});