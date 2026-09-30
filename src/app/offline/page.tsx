import Link from "next/link";
import { Logo } from "@/components/Logo";

export const metadata = { title: "FINORA — Sin conexión" };

export default function OfflinePage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-surface text-on-surface p-6">
      <Logo size={64} />
      <h1 className="font-headline-lg-mobile text-headline-lg-mobile mt-4 text-center">
        Sin conexión
      </h1>
      <p className="font-body-md text-body-md text-on-surface-variant text-center mt-2 max-w-sm">
        No pudimos conectar con el servidor. Verificá tu conexión a internet
        y volvé a intentar.
      </p>
      <Link
        href="/"
        className="mt-6 px-6 py-3 rounded-xl bg-primary text-on-primary font-headline-sm"
      >
        Reintentar
      </Link>
    </main>
  );
}