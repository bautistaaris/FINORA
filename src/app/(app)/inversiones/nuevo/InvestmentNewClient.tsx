"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const ASSET_TYPES = [
  { id: "STOCK", label: "Acción", icon: "show_chart" },
  { id: "CEDEAR", label: "CEDEAR", icon: "show_chart" },
  { id: "ETF", label: "ETF", icon: "donut_large" },
  { id: "CRYPTO", label: "Cripto", icon: "currency_bitcoin" },
  { id: "BOND", label: "Bono", icon: "request_quote" },
  { id: "FUND", label: "Fondo", icon: "donut_small" },
  { id: "FIXED_TERM", label: "Plazo fijo", icon: "savings" },
  { id: "OTHER", label: "Otro", icon: "category" },
];

export function InvestmentNewClient({
  accounts,
}: {
  accounts: { id: string; name: string; currency: string }[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    ticker: "",
    assetType: "STOCK",
    currency: "USD",
    quantity: "0",
    averagePurchasePrice: "0",
    currentPrice: "0",
    accountId: accounts[0]?.id ?? "",
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!form.name) {
      setError("Ingresá un nombre.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          quantity: Number(form.quantity),
          averagePurchasePrice: Number(form.averagePurchasePrice),
          currentPrice: Number(form.currentPrice),
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.push("/inversiones");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-space-md text-on-surface">
      <div className="flex items-center justify-between -mt-2 -mx-margin-mobile px-margin-mobile pt-2">
        <button
          onClick={() => router.back()}
          aria-label="Volver"
          className="w-10 h-10 -ml-2 flex items-center justify-center rounded-full"
        >
          <span className="material-symbols-outlined text-[24px]">arrow_back_ios_new</span>
        </button>
        <h1 className="font-headline-sm font-semibold">Nueva inversión</h1>
        <div className="w-10" />
      </div>

      <Field label="Nombre">
        <input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Bitcoin"
          className="w-full h-12 px-3 bg-surface-container-highest rounded-lg font-body-md text-body-md text-on-surface focus:outline-none"
        />
      </Field>

      <Field label="Ticker">
        <input
          value={form.ticker}
          onChange={(e) => setForm({ ...form, ticker: e.target.value })}
          placeholder="BTC"
          className="w-full h-12 px-3 bg-surface-container-highest rounded-lg font-body-md text-body-md text-on-surface focus:outline-none"
        />
      </Field>

      <Field label="Tipo de activo">
        <div className="grid grid-cols-4 gap-2">
          {ASSET_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setForm({ ...form, assetType: t.id })}
              className={cn(
                "py-2 rounded-lg font-label-md text-label-md font-semibold",
                form.assetType === t.id
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container-high text-on-surface-variant",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-3 gap-2">
        <Field label="Cantidad">
          <input
            type="number"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            className="w-full h-12 px-3 bg-surface-container-highest rounded-lg font-body-md text-body-md text-on-surface focus:outline-none"
          />
        </Field>
        <Field label="Precio prom.">
          <input
            type="number"
            value={form.averagePurchasePrice}
            onChange={(e) => setForm({ ...form, averagePurchasePrice: e.target.value })}
            className="w-full h-12 px-3 bg-surface-container-highest rounded-lg font-body-md text-body-md text-on-surface focus:outline-none"
          />
        </Field>
        <Field label="Precio actual">
          <input
            type="number"
            value={form.currentPrice}
            onChange={(e) => setForm({ ...form, currentPrice: e.target.value })}
            className="w-full h-12 px-3 bg-surface-container-highest rounded-lg font-body-md text-body-md text-on-surface focus:outline-none"
          />
        </Field>
      </div>

      <Field label="Moneda">
        <div className="grid grid-cols-2 gap-2">
          {(["USD", "ARS"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setForm({ ...form, currency: c })}
              className={cn(
                "py-2 rounded-lg font-label-md text-label-md font-semibold",
                form.currency === c
                  ? "bg-primary text-on-primary"
                  : "bg-surface-container-high text-on-surface-variant",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </Field>

      {accounts.length > 0 ? (
        <Field label="Cuenta asociada">
          <select
            value={form.accountId}
            onChange={(e) => setForm({ ...form, accountId: e.target.value })}
            className="w-full h-12 px-3 bg-surface-container-highest rounded-lg font-body-md text-body-md text-on-surface focus:outline-none"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      {error ? (
        <div className="text-error font-body-sm bg-error-container/30 p-2 rounded-lg">
          {error}
        </div>
      ) : null}

      <button
        onClick={submit}
        disabled={creating}
        className="w-full h-12 rounded-xl bg-primary text-on-primary font-headline-sm font-semibold disabled:opacity-50"
      >
        {creating ? "Creando…" : "Crear posición"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-label-md text-label-md text-on-surface-variant font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}