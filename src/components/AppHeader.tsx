import Link from "next/link";
import { Logo } from "./Logo";
import { PrivacyToggle } from "./PrivacyToggle";
import { auth, signOut } from "@/lib/auth";

export async function AppHeader({ title }: { title?: string }) {
  const session = await auth();
  const userEmail = session?.user?.email;

  return (
    <header className="fixed top-0 w-full z-50 pt-safe bg-surface/80 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.18)]">
      <div className="flex items-center justify-between px-margin-mobile h-16">
        <div className="flex items-center gap-space-sm min-w-0">
          <Link href="/" className="flex items-center gap-space-sm shrink-0">
            <Logo size={32} />
            <span className="font-headline-sm text-headline-sm font-semibold tracking-tight text-on-surface">
              FINORA
            </span>
          </Link>
          {title ? (
            <span className="font-label-sm text-label-sm text-on-surface-variant truncate">
              · {title}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-space-xs shrink-0">
          <PrivacyToggle />
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              aria-label="Cerrar sesión"
              className="w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined text-[22px]">logout</span>
            </button>
          </form>
          <div
            aria-label={userEmail ?? "Cuenta"}
            className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-glow-primary"
            title={userEmail ?? undefined}
          >
            <span className="material-symbols-outlined text-on-primary text-[18px]">
              person
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}