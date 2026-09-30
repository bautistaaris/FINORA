"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/finance";
import { usePrivacyMode } from "@/components/PrivacyMode";
import { EmptyState } from "@/components/States";

interface AccountItem {
  id: string;
  name: string;
  type: string;
  currency: string;
  balance: number;
  convertedBalance: number;
  icon: string | null;
  color: string | null;
  isActive: boolean;
}

const TYPE_LABEL: Record<string, string> = {
  CASH: "Efectivo",
  BANK: "Cuenta bancaria",
  WALLET: "Billetera digital",
  CREDIT_CARD: "Tarjeta de crédito",
  BROKER: "Broker",
  CRYPTO: "Crypto",
  OTHER: "Otro",
};

const TYPE_ICON: Record<string, string> = {
  CASH: "payments",
  BANK: "account_balance",
  WALLET: "account_balance_wallet",
  CREDIT_CARD: "credit_card",
  BROKER: "trending_up",
  CRYPTO: "currency_bitcoin",
  OTHER: "account_box",
};

export function AccountsClient({
  accounts,
  baseCurrency,
}: {
  accounts: AccountItem[];
  baseCurrency: string;
}) {
  const { masked } = usePrivacyMode();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: "",
    type: "BANK",
    currency: baseCurrency,
    initialBalance: "0",
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalConverted = accounts.reduce((acc, a) => acc + a.convertedBalance, 0);

  const submit = async () => {
    if (!form.name) {
      setError("Ingresá un nombre.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          type: form.type,
          currency: form.currency,
          initialBalance: Number(form.initialBalance) || 0,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-space-md text-on-surface">
      <header className="pt-1">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-semibold tracking-tight">
          Cuentas
        </h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Total: {masked ? "$ •••••" : formatMoney(totalConverted, baseCurrency)} ({baseCurrency})
        </p>
      </header>

      {accounts.length === 0 ? (
        <EmptyState
          icon="account_balance"
          title="Sin cuentas registradas"
          description="Agregá tu primera cuenta para empezar a registrar movimientos."
          action={
            <button
              onClick={() => setShowAdd(true)}
              className="px-4 py-2 bg-primary text-on-primary rounded-lg font-label-md"
            >
              Crear cuenta
            </button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {accounts.map((acc) => (
            <div
              key={acc.id}
              className="flex items-center justify-between p-3.5 rounded-xl bg-surface-container-low shadow-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: (acc.color ?? "#68dba9") + "20",
                    color: acc.color ?? "#68dba9",
                  }}
                >
                  <span className="material-symbols-outlined text-[22px]">
                    {TYPE_ICON[acc.type] ?? acc.icon ?? "account_balance"}
                  </span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-body-md text-body-md font-medium text-on-surface truncate">
                    {acc.name}
                  </span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    {TYPE_LABEL[acc.type] ?? acc.type}
                    {acc.currency !== baseCurrency ? ` · ${acc.currency}` : ""}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div
                  className={cn(
                    "font-numeric-list text-numeric-list font-semibold tabular-nums",
                    acc.balance < 0 ? "text-error" : "text-on-surface",
                  )}
                >
                  {masked ? "$ ••••" : formatMoney(acc.balance, acc.currency)}
                </div>
                {acc.currency !== baseCurrency ? (
                  <div className="font-label-sm text-label-sm text-on-surface-variant tabular-nums">
                    ≈ {masked ? "•••" : formatMoney(acc.convertedBalance, baseCurrency)}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setShowAdd(true)}
        className="w-full h-12 rounded-xl bg-primary-container text-on-primary-container font-label-md text-label-md font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
      >
        <span className="material-symbols-outlined text-[20px]">add</span>
        <span>Nueva cuenta</span>
      </button>

      {showAdd ? (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setShowAdd(false)}
        >
          <div className="w-full bg-surface-container rounded-t-3xl p-margin-mobile flex flex-col gap-space-md shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="w-10 h-1 bg-outline-variant/50 rounded-full mx-auto -mt-1 mb-1" />
            <div className="flex items-center justify-between">
              <h2 className="font-headline-sm text-headline-sm font-semibold">
                Nueva cuenta
              </h2>
              <button
                onClick={() => setShowAdd(false)}
                aria-label="Cerrar"
                className="w-9 h-9 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <Field label="Nombre">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Banco Galicia"
                className="w-full h-12 px-3 bg-surface-container-highest rounded-lg font-body-md text-body-md text-on-surface focus:outline-none"
              />
            </Field>

            <Field label="Tipo">
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full h-12 px-3 bg-surface-container-highest rounded-lg font-body-md text-body-md text-on-surface focus:outline-none"
              >
                {Object.entries(TYPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Moneda">
              <div className="grid grid-cols-2 gap-2">
                {(["ARS", "USD"] as const).map((c) => (
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

            <Field label="Saldo inicial">
              <input
                type="number"
                value={form.initialBalance}
                onChange={(e) =>
                  setForm({ ...form, initialBalance: e.target.value })
                }
                className="w-full h-12 px-3 bg-surface-container-highest rounded-lg font-body-md text-body-md text-on-surface focus:outline-none"
              />
            </Field>

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
              {creating ? "Creando…" : "Crear cuenta"}
            </button>
          </div>
        </div>
      ) : null}
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