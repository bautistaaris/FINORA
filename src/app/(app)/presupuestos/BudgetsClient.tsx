"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatMoney, formatPercent } from "@/lib/finance";
import { usePrivacyMode } from "@/components/PrivacyMode";
import { EmptyState } from "@/components/States";

interface BudgetItem {
  id: string;
  categoryId: string;
  categoryName: string;
  icon: string;
  limit: number;
  spent: number;
  remaining: number;
  percentage: number;
  currency: string;
}

export function BudgetsClient({
  budgets,
  baseCurrency,
  month,
  year,
}: {
  budgets: BudgetItem[];
  baseCurrency: string;
  month: number;
  year: number;
}) {
  const { masked } = usePrivacyMode();
  const [showAdd, setShowAdd] = useState(false);
  const [categories, setCategories] = useState<{ id: string; name: string; icon: string | null }[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [limit, setLimit] = useState("0");

  const totalLimit = budgets.reduce((acc, b) => acc + b.limit, 0);
  const totalSpent = budgets.reduce((acc, b) => acc + b.spent, 0);

  const monthLabel = new Date(year, month - 1, 1).toLocaleString("es-AR", { month: "long" });
  const monthCap = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  const openAdd = async () => {
    setShowAdd(true);
    if (categories.length === 0) {
      const res = await fetch("/api/categories");
      const json = await res.json();
      setCategories(
        (json.data ?? []).filter(
          (c: { type: string }) => c.type === "EXPENSE",
        ),
      );
    }
  };

  const submit = async () => {
    if (!selectedCat || Number(limit) <= 0) return;
    await fetch("/api/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: selectedCat,
        month,
        year,
        limitAmount: Number(limit),
        currency: baseCurrency,
      }),
    });
    window.location.reload();
  };

  return (
    <div className="flex flex-col gap-space-md text-on-surface">
      <header className="pt-1">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-semibold tracking-tight">
          Presupuestos
        </h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant">{monthCap} {year}</p>
        <div className="mt-2 p-3 rounded-xl bg-surface-container-low">
          <div className="flex items-center justify-between mb-1">
            <span className="font-label-sm text-label-sm text-on-surface-variant">Total ejecutado</span>
            <span className="font-numeric-list text-numeric-list font-semibold tabular-nums text-on-surface">
              {masked ? "$ ••••" : formatMoney(totalSpent, baseCurrency)} / {masked ? "$ ••••" : formatMoney(totalLimit, baseCurrency)}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full",
                totalSpent > totalLimit ? "bg-error" : "bg-primary",
              )}
              style={{ width: `${Math.min((totalSpent / Math.max(totalLimit, 1)) * 100, 100)}%` }}
            />
          </div>
        </div>
      </header>

      {budgets.length === 0 ? (
        <EmptyState
          icon="target"
          title="Sin presupuestos"
          description="Creá un presupuesto por categoría para controlar tu gasto mensual."
          action={
            <button
              onClick={openAdd}
              className="px-4 py-2 bg-primary text-on-primary rounded-lg font-label-md"
            >
              Crear presupuesto
            </button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {budgets.map((b) => (
            <div
              key={b.id}
              className="flex flex-col gap-2 p-3.5 rounded-xl bg-surface-container-low"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center text-secondary">
                    <span className="material-symbols-outlined text-[18px]">
                      {b.icon}
                    </span>
                  </div>
                  <span className="font-body-md text-body-md font-medium text-on-surface truncate">
                    {b.categoryName}
                  </span>
                </div>
                <span
                  className={cn(
                    "font-numeric-list text-numeric-list font-semibold tabular-nums",
                    b.percentage >= 1 ? "text-error" : "text-on-surface",
                  )}
                >
                  {masked ? "$ ••••" : formatMoney(b.spent, b.currency)} /{" "}
                  {masked ? "$ ••••" : formatMoney(b.limit, b.currency)}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-container-highest overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    b.percentage >= 1
                      ? "bg-error"
                      : b.percentage >= 0.8
                        ? "bg-secondary"
                        : "bg-primary",
                  )}
                  style={{ width: `${Math.min(b.percentage * 100, 100)}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-label-sm font-label-sm">
                <span
                  className={cn(
                    b.percentage >= 1 ? "text-error" : "text-primary",
                  )}
                >
                  {b.percentage >= 1
                    ? `Excedido por ${masked ? "$ ••" : formatMoney(b.spent - b.limit, b.currency)}`
                    : `Restante ${masked ? "$ ••" : formatMoney(b.remaining, b.currency)}`}
                </span>
                <span className="text-on-surface-variant">
                  {formatPercent(b.percentage, 0)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={openAdd}
        className="w-full h-12 rounded-xl bg-primary-container text-on-primary-container font-label-md font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
      >
        <span className="material-symbols-outlined text-[20px]">add</span>
        <span>Nuevo presupuesto</span>
      </button>

      {showAdd ? (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setShowAdd(false)}
        >
          <div className="w-full bg-surface-container rounded-t-3xl p-margin-mobile flex flex-col gap-space-md shadow-2xl">
            <div className="w-10 h-1 bg-outline-variant/50 rounded-full mx-auto -mt-1 mb-1" />
            <h2 className="font-headline-sm font-semibold">Nuevo presupuesto</h2>

            <Field label="Categoría">
              <select
                value={selectedCat ?? ""}
                onChange={(e) => setSelectedCat(e.target.value)}
                className="w-full h-12 px-3 bg-surface-container-highest rounded-lg font-body-md text-body-md text-on-surface focus:outline-none"
              >
                <option value="">Seleccionar…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label={`Límite mensual (${baseCurrency})`}>
              <input
                type="number"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                className="w-full h-12 px-3 bg-surface-container-highest rounded-lg font-body-md text-body-md text-on-surface focus:outline-none"
              />
            </Field>

            <button
              onClick={submit}
              className="w-full h-12 rounded-xl bg-primary text-on-primary font-headline-sm font-semibold"
            >
              Crear
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