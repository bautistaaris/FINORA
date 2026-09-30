import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  recordAttempt,
  isEmailLockedOut,
  isIpLockedOut,
  getClientIp,
} from "@/lib/rate-limit";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      baseCurrency: string;
      privacyMode: boolean;
    } & DefaultSession["user"];
  }
}

declare global {
  namespace AuthJwt {
    interface JWT {
      id: string;
      baseCurrency: string;
      privacyMode: boolean;
    }
  }
}
export {};

const credentialsSchema = z.object({
  email: z.string().email().min(3).max(255),
  password: z.string().min(8).max(255),
});

const isProd = process.env.NODE_ENV === "production";

/**
 * Política de sesión:
 *  - JWT, expiración 12h (uso diario cómodo)
 *  - Renovar en cada request si le faltan menos de 1h
 *  - Cookies Secure en prod, httpOnly siempre, SameSite=Lax
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 12, // 12h
    updateAge: 60 * 60, // refresh si le falta < 1h
  },
  pages: { signIn: "/login" },
  cookies: {
    sessionToken: {
      name: isProd ? "__Secure-authjs.session-token" : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProd,
      },
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials, req) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const normalized = email.toLowerCase().trim();

        const ip = getClientIp((req?.headers ?? new Headers()) as Headers);

        // Rate limiting: revisar ANTES de tocar DB de users (cheap)
        if (await isEmailLockedOut(normalized)) {
          await recordAttempt(normalized, ip, false);
          return null;
        }
        if (ip !== "unknown" && (await isIpLockedOut(ip))) {
          await recordAttempt(normalized, ip, false);
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: normalized },
        });
        if (!user) {
          // Simular bcrypt igual para no dar feedback de timing
          await bcrypt.compare(password, "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
          await recordAttempt(normalized, ip, false);
          return null;
        }

        const valid2 = await bcrypt.compare(password, user.passwordHash);
        if (!valid2) {
          await recordAttempt(normalized, ip, false);
          return null;
        }

        await recordAttempt(normalized, ip, true);
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.email,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = (user.id as string) ?? "";
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id as string },
          select: { baseCurrency: true, privacyMode: true },
        });
        token.baseCurrency = dbUser?.baseCurrency ?? "ARS";
        token.privacyMode = dbUser?.privacyMode ?? false;
      }
      if (trigger === "update" && token.id) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { baseCurrency: true, privacyMode: true },
        });
        if (dbUser) {
          token.baseCurrency = dbUser.baseCurrency;
          token.privacyMode = dbUser.privacyMode;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = (token.id as string) ?? "";
        session.user.baseCurrency = (token.baseCurrency as string) ?? "ARS";
        session.user.privacyMode = (token.privacyMode as boolean) ?? false;
      }
      return session;
    },
  },
  events: {
    async signOut() {
      // Limpieza al cerrar sesión: se podrían invalidar tokens activos.
      // Por simplicidad sólo limpiamos el record.
    },
  },
});