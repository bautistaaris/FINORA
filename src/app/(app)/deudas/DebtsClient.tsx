"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/finance";
import { usePrivacyMode } from "@/components/PrivacyMode";
import { EmptyState } from "@/components/States";

interface DebtItem {
  id: string;
  name: string;
  currency: string;
  originalAmount: number;
  remainingAmount: number;
  convertedRemaining: number;
  interestRate: number | null;
  dueDate: string | null;
  status: "ACTIVE" | "PAID" | "CANCELLED";
  installments: number | null;
  progress: number;
}

export function DebtsClient({
  debts,
  baseCurrency,
}: {
  debts: DebtItem[];
  baseCurrency: string;
}) {
  const { masked } = usePrivacyMode();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    name: "",
    originalAmount: "0",
    remainingAmount: "0",
    currency: baseCurrency,
    installments: "",
    interestRate: "",
    dueDate: format(new Date(Date.now() + 30 * 24 * 3600 * 1000), "yyyy-MM-dd"),
  });
  const [creating, setCreating] = useState(false);

  const totalDebt = debts
    .filter((d) => d.status === "ACTIVE")
    .reduce((acc, d) => acc + d.convertedRemaining, 0);

  const submit = async () => {
    if (!form.name || Number(form.originalAmount) <= 0) return;
    setCreating(true);
    await fetch("/api/debts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        originalAmount: Number(form.originalAmount),
        remainingAmount: Number(form.remainingAmount) || Number(form.originalAmount),
        currency: form.currency,
        installments: form.installments ? Number(form.installments) : null,
        interestRate: form.interestRate ? Number(form.interestRate) : null,
        dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
        status: "ACTIVE",
      }),
    });
    window.location.reload();
  };

  return (
    <div className="flex flex-col gap-space-md text-on-surface">
      <header className="pt-1">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-semibold tracking-tight">
          Deudas
        </h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant">Total activo</p>
        <div className="mt-2 p-3 rounded-xl bg-surface-container-low">
          <span className="font-numeric-card text-numeric-card font-semibold text-error tabular-nums">
            {masked ? "$ •••••" : formatMoney(totalDebt, baseCurrency)}
          </span>
        </div>
      </header>

      {debts.length === 0 ? (
        <EmptyState
          icon="credit_card_off"
          title="Sin deudas registradas"
          description="FINORA considera las deudas para tu patrimonio neto."
          action={
            <button
              onClick={() => setShowAdd(true)}
              className="px-4 py-2 bg-primary text-on-primary rounded-lg font-label-md"
            >
              Registrar deuda
            </button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {debts.map((d) => (
            <div
              key={d.id}
              className="flex flex-col gap-2 p-3.5 rounded-xl bg-surface-container-low"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <span className="font-body-md text-body-md font-medium text-on-surface truncate">
                    {d.name}
                  </span>
                  {d.dueDate ? (
                    <span className="font-label-sm text-label-sm text-on-surface-variant block">
                      Vence: {format(parseISO(d.dueDate), "d 'de' MMM yyyy", { locale: es })}
                    </span>
                  ) : null}
                </div>
                <div className="text-right shrink-0">
                  <span className="font-numeric-list text-numeric-list font-semibold text-error tabular-nums">
                    {masked ? "$ ••••" : formatMoney(d.remainingAmount, d.currency)}
                  </span>
                  {d.installments ? (
                    <span className="font-label-sm text-label-sm text-on-surface-variant block">
                      {d.installments} cuotas
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="w-full h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    d.status === "PAID" ? "bg-primary" : "bg-secondary",
                  )}
                  style={{ width: `${d.progress * 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-label-sm font-label-sm text-on-surface-variant">
                <span>
                  Pagado {Math.round(d.progress * 100)}% · Restante{" "}
                  {masked ? "$ ••" : formatMoney(d.remainingAmount, d.currency)}
                </span>
                {d.interestRate ? (
                  <span>{d.interestRate.toFixed(2)}% interes</span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setShowAdd(true)}
        className="w-full h-12 rounded-xl bg-primary-container text-on-primary-container font-label-md font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
      >
        <span className="material-symbols-outlined text-[20px]">add</span>
        <span>Nueva deuda</span>
      </button>

      {showAdd ? (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setShowAdd(false)}
        >
          <div className="w-full bg-surface-container rounded-t-3xl p-margin-mobile flex flex-col gap-space-md shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="w-10 h-1 bg-outline-variant/50 rounded-full mx-auto -mt-1 mb-1" />
            <h2 className="font-headline-sm font-semibold">Nueva deuda</h2>

            <Field label="Nombre">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Préstamo personal"
                className="w-full h-12 px-3 bg-surface-container-highest rounded-lg font-body-md text-body-md text-on-surface focus:outline-none"
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Importe original">
                <input
                  type="number"
                  value={form.originalAmount}
                  onChange={(e) => setForm({ ...form, originalAmount: e.target.value })}
                  className="w-full h-12 px-3 bg-surface-container-highest rounded-lg font-body-md text-body-md text-on-surface focus:outline-none"
                />
              </Field>
              <Field label="Pendiente">
                <input
                  type="number"
                  value={form.remainingAmount}
                  onChange={(e) => setForm({ ...form, remainingAmount: e.target.value })}
                  className="w-full h-12 px-3 bg-surface-container-highest rounded-lg font-body-md text-body-md text-on-surface focus:outline-none"
                />
              </Field>
            </div>

            <Field label="Cuotas (opcional)">
              <input
                type="number"
                value={form.installments}
                onChange={(e) => setForm({ ...form, installments: e.target.value })}
                className="w-full h-12 px-3 bg-surface-container-highest rounded-lg font-body-md text-body-md text-on-surface focus:outline-none"
              />
            </Field>

            <Field label="Interés anual % (opcional)">
              <input
                type="number"
                step="0.01"
                value={form.interestRate}
                onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
                className="w-full h-12 px-3 bg-surface-container-highest rounded-lg font-body-md text-body-md text-on-surface focus:outline-none"
              />
            </Field>

            <Field label="Vencimiento">
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full h-12 px-3 bg-surface-container-highest rounded-lg font-body-md text-body-md text-on-surface focus:outline-none"
              />
            </Field>

            <button
              onClick={submit}
              disabled={creating}
              className="w-full h-12 rounded-xl bg-primary text-on-primary font-headline-sm font-semibold"
            >
              {creating ? "Creando…" : "Registrar"}
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
      <label className="font-label-md text-label-md text-on-surface-variant font-medium">{label}</label>
      {children}
    </div>
  );
}