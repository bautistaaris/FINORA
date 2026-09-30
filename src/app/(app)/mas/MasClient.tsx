"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/finance";

interface Props {
  user: { email: string; name: string | null; baseCurrency: string; privacyMode: boolean };
  lastRate: { from: string; to: string; rate: number; date: Date | string } | null;
  counts: { accounts: number; subscriptions: number; transactions: number; investments: number };
  logoutAction: () => Promise<void>;
}

const SECTIONS = [
  { href: "/cuentas", icon: "account_balance", label: "Cuentas" },
  { href: "/suscripciones", icon: "subscriptions", label: "Suscripciones" },
  { href: "/presupuestos", icon: "target", label: "Presupuestos" },
  { href: "/deudas", icon: "credit_card_off", label: "Deudas" },
  { href: "/inversiones", icon: "trending_up", label: "Inversiones" },
];

export function MasClient({ user, lastRate, counts, logoutAction }: Props) {
  const [privacyMode, setPrivacyMode] = useState(user.privacyMode);
  const [rateValue, setRateValue] = useState(lastRate?.rate?.toString() ?? "1450");

  const togglePrivacy = async () => {
    const next = !privacyMode;
    setPrivacyMode(next);
    await fetch("/api/me/privacy", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ privacyMode: next }),
    });
  };

  const saveRate = async () => {
    if (!lastRate) return;
    await fetch("/api/exchange-rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from: lastRate.from,
        to: lastRate.to,
        rate: Number(rateValue),
        source: "MANUAL",
      }),
    });
    window.location.reload();
  };

  const exportData = async (format: "json" | "csv") => {
    const res = await fetch(`/api/export?format=${format}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finora-export.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-space-md text-on-surface">
      <header className="pt-1">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-semibold tracking-tight">
          Más
        </h1>
      </header>

      {/* Profile card */}
      <section className="flex items-center gap-3 p-4 rounded-xl bg-surface-container-low">
        <div className="w-12 h-12 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-glow-primary shrink-0">
          <span className="material-symbols-outlined text-[26px]">person</span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-body-md text-body-md font-semibold text-on-surface truncate">
            {user.name ?? user.email}
          </span>
          <span className="font-label-sm text-label-sm text-on-surface-variant truncate">
            {user.email}
          </span>
          <span className="font-label-sm text-label-sm text-primary mt-0.5">
            Moneda base: {user.baseCurrency}
          </span>
        </div>
      </section>

      {/* Sections grid */}
      <div className="grid grid-cols-3 gap-2">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex flex-col items-center gap-1 p-3 rounded-xl bg-surface-container-low hover:bg-surface-container transition-colors"
          >
            <span className="material-symbols-outlined text-[26px] text-primary">
              {s.icon}
            </span>
            <span className="font-label-md text-label-md font-medium text-on-surface">
              {s.label}
            </span>
          </Link>
        ))}
      </div>

      {/* Stats */}
      <section className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-surface-container-low">
        <Stat label="Cuentas" value={counts.accounts} />
        <Stat label="Suscripciones" value={counts.subscriptions} />
        <Stat label="Movimientos" value={counts.transactions} />
      </section>

      {/* Privacy */}
      <section className="flex items-center justify-between p-4 rounded-xl bg-surface-container-low">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary">
            {privacyMode ? "visibility_off" : "visibility"}
          </span>
          <div>
            <span className="font-body-md text-body-md font-medium text-on-surface block">
              Modo privacidad
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant block">
              Ocultar todos los importes
            </span>
          </div>
        </div>
        <button
          onClick={togglePrivacy}
          className={cn(
            "w-12 h-7 rounded-full transition-colors relative",
            privacyMode ? "bg-primary" : "bg-surface-container-highest",
          )}
          aria-pressed={privacyMode}
          aria-label="Alternar privacidad"
        >
          <span
            className={cn(
              "absolute top-0.5 w-6 h-6 rounded-full bg-on-primary shadow-md transition-transform",
              privacyMode ? "translate-x-5" : "translate-x-0.5",
            )}
          />
        </button>
      </section>

      {/* Cotización manual */}
      {lastRate ? (
        <section className="flex flex-col gap-2 p-4 rounded-xl bg-surface-container-low">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary">currency_exchange</span>
            <span className="font-body-md text-body-md font-medium text-on-surface">
              Cotización USD → ARS
            </span>
          </div>
          <p className="font-label-sm text-label-sm text-on-surface-variant">
            Última actualización:{" "}
            {new Date(lastRate.date).toLocaleString("es-AR")}
          </p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={rateValue}
              onChange={(e) => setRateValue(e.target.value)}
              className="flex-1 h-12 px-3 bg-surface-container-highest rounded-lg font-body-md text-body-md text-on-surface focus:outline-none"
            />
            <button
              onClick={saveRate}
              className="h-12 px-4 rounded-xl bg-primary text-on-primary font-label-md font-semibold"
            >
              Guardar
            </button>
          </div>
        </section>
      ) : null}

      {/* Export */}
      <section className="flex flex-col gap-2 p-4 rounded-xl bg-surface-container-low">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-tertiary">download</span>
          <span className="font-body-md text-body-md font-medium text-on-surface">
            Exportar mis datos
          </span>
        </div>
        <p className="font-label-sm text-label-sm text-on-surface-variant">
          Descargá un backup completo de tu información.
        </p>
        <div className="grid grid-cols-2 gap-2 mt-1">
          <button
            onClick={() => exportData("csv")}
            className="h-11 rounded-xl bg-surface-container-high text-on-surface font-label-md font-semibold"
          >
            CSV (movimientos)
          </button>
          <button
            onClick={() => exportData("json")}
            className="h-11 rounded-xl bg-surface-container-high text-on-surface font-label-md font-semibold"
          >
            JSON completo
          </button>
        </div>
      </section>

      {/* Security */}
      <section className="flex flex-col gap-2 p-4 rounded-xl bg-surface-container-low">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">verified_user</span>
          <span className="font-body-md text-body-md font-medium text-on-surface">
            Seguridad
          </span>
        </div>
        <ul className="text-label-sm font-label-sm text-on-surface-variant space-y-1 mt-1">
          <li>• Sesión cifrada con JWT (8h)</li>
          <li>• Contraseñas hasheadas con bcrypt</li>
          <li>• Rutas y APIs protegidas con middleware</li>
          <li>• Headers: X-Frame-Options, CSP, HSTS, noindex</li>
        </ul>
      </section>

      {/* System */}
      <Link
        href="/sistema"
        className="h-12 rounded-xl bg-surface-container-high text-on-surface font-label-md font-semibold flex items-center justify-center active:scale-[0.98] transition-all"
      >
        <span className="material-symbols-outlined text-[20px] mr-2">monitoring</span>
        <span>Sistema (health & sync)</span>
      </Link>

      {/* Sync */}
      <Link
        href="/mas/sync"
        className="h-12 rounded-xl bg-surface-container-high text-on-surface font-label-md font-semibold flex items-center justify-center active:scale-[0.98] transition-all"
      >
        <span className="material-symbols-outlined text-[20px] mr-2">sync</span>
        <span>Obsidian Sync</span>
      </Link>
      <form action={logoutAction}>
        <button
          type="submit"
          className="w-full h-12 rounded-xl bg-error-container text-error font-label-md font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
        >
          <span className="material-symbols-outlined text-[20px]">logout</span>
          <span>Cerrar sesión</span>
        </button>
      </form>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center">
      <span className="font-numeric-card text-numeric-card font-semibold text-on-surface tabular-nums">
        {value}
      </span>
      <span className="font-label-sm text-label-sm text-on-surface-variant">{label}</span>
    </div>
  );
}