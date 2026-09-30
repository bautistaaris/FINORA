import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { PasswordToggle, BiometricButton } from "./LoginInteractive";

export const metadata = {
  title: "FINORA — Acceso",
};

async function loginAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return;

  try {
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
  } catch {
    return;
  }
  redirect("/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");
  const params = await searchParams;
  const error = params.error;

  return (
    <main className="flex flex-col relative w-full bg-surface min-h-screen pt-safe pb-safe">
      <div className="flex flex-col w-full px-margin-mobile pb-space-lg text-on-surface">
        <div className="relative w-full max-w-sm mx-auto flex flex-col pt-space-lg">
          {/* Ambient glow */}
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

          {/* Top status pill */}
          <div className="flex items-center justify-between mb-space-xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-low text-on-surface-variant text-label-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="tracking-wide uppercase font-label-sm">
                Bóveda cifrada
              </span>
            </div>
            <button
              aria-label="Ayuda de acceso"
              className="w-8 h-8 rounded-full flex items-center justify-center bg-surface-container text-on-surface-variant hover:text-on-surface active:scale-95 transition-transform"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">lock_reset</span>
            </button>
          </div>

          {/* Brand header */}
          <div className="flex flex-col items-center text-center mb-space-xl">
            <div className="relative mb-space-sm p-2 rounded-xl bg-surface-container-high shadow-md">
              <svg
                width="56"
                height="56"
                viewBox="0 0 64 64"
                className="rounded-lg"
                aria-label="FINORA Monogram"
              >
                <rect width="64" height="64" rx="14" fill="#1a1c1f" />
                <rect x="12" y="20" width="32" height="6" rx="3" fill="#68dba9" />
                <rect x="12" y="30" width="28" height="6" rx="3" fill="#68dba9" />
                <rect x="12" y="40" width="18" height="6" rx="3" fill="#68dba9" />
                <circle cx="40" cy="43" r="3" fill="#68dba9" />
              </svg>
              <div className="absolute inset-0 rounded-xl bg-primary/5 pointer-events-none" />
            </div>
            <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface tracking-tight mt-1">
              FINORA
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant italic mt-0.5">
              &ldquo;Tu dinero, claro.&rdquo;
            </p>
          </div>

          {/* Form */}
          <form
            action={loginAction}
            className="flex flex-col gap-space-md w-full bg-surface-container-low p-space-lg rounded-xl shadow-lg relative"
          >
            <div className="absolute inset-x-0 top-0 h-px bg-white/10 rounded-t-xl pointer-events-none" />

            {error ? (
              <div className="px-3 py-2 rounded-lg bg-error-container/40 text-error font-body-sm text-body-sm">
                Credenciales inválidas. Verificá email y contraseña.
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <label
                className="font-label-md text-label-md text-on-surface-variant flex items-center justify-between"
                htmlFor="email"
              >
                <span>Identificador o correo</span>
                <span className="text-label-sm font-label-sm text-outline">
                  Privado
                </span>
              </label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3.5 text-outline text-[20px] pointer-events-none">
                  alternate_email
                </span>
                <input
                  name="email"
                  id="email"
                  autoComplete="email"
                  className="w-full h-12 pl-11 pr-4 bg-surface-container-highest text-on-surface placeholder:text-outline font-body-md text-body-md rounded-lg focus:outline-none focus:ring-0 focus:bg-surface-bright transition-colors"
                  placeholder="tu@email.com"
                  required
                  type="email"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label
                  className="font-label-md text-label-md text-on-surface-variant"
                  htmlFor="password"
                >
                  Contraseña maestra
                </label>
                <button
                  className="font-label-sm text-label-sm text-primary hover:text-primary-fixed-dim transition-colors"
                  type="button"
                >
                  ¿Olvidaste?
                </button>
              </div>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-3.5 text-outline text-[20px] pointer-events-none">
                  key
                </span>
                <input
                  name="password"
                  id="password"
                  autoComplete="current-password"
                  className="w-full h-12 pl-11 pr-12 bg-surface-container-highest text-on-surface placeholder:text-outline font-body-md text-body-md rounded-lg focus:outline-none focus:ring-0 focus:bg-surface-bright transition-colors tracking-widest"
                  placeholder="••••••••••••"
                  required
                  type="password"
                  minLength={6}
                />
                <PasswordToggle />
              </div>
            </div>

            <button
              type="submit"
              className="w-full h-12 mt-2 rounded-lg bg-primary-container text-on-primary font-headline-sm text-headline-sm flex items-center justify-center gap-2 shadow-md hover:opacity-95 active:scale-[0.98] transition-all"
            >
              <span className="font-headline-sm">Entrar</span>
              <span className="material-symbols-outlined text-[20px]">
                arrow_forward
              </span>
            </button>

            <div className="relative flex items-center justify-center my-1">
              <div className="w-full h-px bg-outline-variant/30" />
              <span className="absolute bg-surface-container-low px-2 font-label-sm text-label-sm text-outline">
                o verificación física
              </span>
            </div>

            <BiometricButton />

            <div
              className="hidden items-center gap-2 p-2.5 rounded-lg bg-surface-container-highest text-primary font-body-sm text-body-sm transition-all"
              id="biometric-alert"
              role="status"
            >
              <span className="material-symbols-outlined text-[18px] animate-spin">
                sync
              </span>
              <span>Autenticando enclave de seguridad...</span>
            </div>
          </form>

          <div className="mt-space-lg flex flex-col items-center gap-space-sm text-center">
            <div className="flex items-center gap-1.5 text-on-surface-variant font-label-sm text-label-sm">
              <span
                className="material-symbols-outlined text-[15px] text-primary"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                verified_user
              </span>
              <span>Sesión protegida por cifrado de extremo a extremo</span>
            </div>
            <p className="font-body-sm text-body-sm text-outline-variant text-[11px] mt-2">
              FINORA Secure Core · Protocolo Zero-Knowledge
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}