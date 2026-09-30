"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  formatMoney,
  formatPercent,
  calcSubscriptionMonthlyCost,
} from "@/lib/finance";
import { usePrivacyMode } from "@/components/PrivacyMode";
import { EmptyState } from "@/components/States";

interface InvItem {
  id: string;
  name: string;
  ticker: string | null;
  assetType: string;
  currency: string;
  quantity: number;
  averagePurchasePrice: number;
  currentPrice: number;
  investedCapital: number;
  currentValue: number;
  profitLoss: number;
  profitLossPct: number;
  transactions: Array<{
    id: string;
    type: string;
    quantity: number;
    price: number;
    amount: number;
    currency: string;
    date: string;
  }>;
}

const TYPE_ICON: Record<string, string> = {
  STOCK: "show_chart",
  CEDEAR: "show_chart",
  ETF: "donut_large",
  CRYPTO: "currency_bitcoin",
  BOND: "request_quote",
  FUND: "donut_small",
  FIXED_TERM: "savings",
  CASH: "payments",
  OTHER: "category",
};

export function InvestmentsClient({
  items,
  baseCurrency,
}: {
  items: InvItem[];
  baseCurrency: string;
}) {
  const { masked } = usePrivacyMode();
  const [selectedId, setSelectedId] = useState<string | null>(items[0]?.id ?? null);

  const totalInvested = items.reduce((acc, i) => acc + i.investedCapital, 0);
  const totalValue = items.reduce((acc, i) => acc + i.currentValue, 0);
  const totalPL = totalValue - totalInvested;
  const totalPct = totalInvested > 0 ? totalPL / totalInvested : 0;

  const selected = items.find((i) => i.id === selectedId);

  if (items.length === 0) {
    return (
      <EmptyState
        icon="trending_up"
        title="Sin inversiones"
        description="Registrá tu primera posición para empezar a trackear tu portfolio."
        action={
          <Link
            href="/inversiones/nuevo"
            className="px-4 py-2 bg-primary text-on-primary rounded-lg font-label-md"
          >
            Crear posición
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-space-md text-on-surface">
      <header className="pt-1">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-semibold tracking-tight">
          Inversiones
        </h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Portfolio total
        </p>
        <div className="mt-2 p-3 rounded-xl bg-surface-container-low">
          <div className="flex items-baseline justify-between">
            <span className="font-numeric-card text-numeric-card font-semibold text-on-surface tabular-nums">
              {masked ? "$ •••••" : formatMoney(totalValue, baseCurrency)}
            </span>
            <span
              className={cn(
                "font-label-md text-label-md font-semibold",
                totalPL >= 0 ? "text-primary" : "text-error",
              )}
            >
              {totalPL >= 0 ? "+" : ""}
              {masked
                ? "$ ••••"
                : formatMoney(Math.abs(totalPL), baseCurrency)}{" "}
              ({totalPct >= 0 ? "+" : ""}
              {(totalPct * 100).toFixed(2)}%)
            </span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2">
        {items.map((inv) => (
          <button
            key={inv.id}
            onClick={() => setSelectedId(inv.id)}
            className={cn(
              "flex flex-col items-start p-3 rounded-xl gap-1 transition-colors text-left",
              selectedId === inv.id
                ? "bg-primary-container text-on-primary-container"
                : "bg-surface-container-low",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">
                {TYPE_ICON[inv.assetType] ?? "category"}
              </span>
              <span className="font-label-md text-label-md font-semibold">
                {inv.ticker ?? inv.name}
              </span>
            </div>
            <span
              className={cn(
                "font-numeric-list text-numeric-list font-semibold tabular-nums",
                inv.profitLoss >= 0 ? "text-primary" : "text-error",
              )}
            >
              {inv.profitLoss >= 0 ? "+" : ""}
              {masked
                ? "••••"
                : formatMoney(inv.profitLoss, inv.currency)}
            </span>
            <span className="font-label-sm text-label-sm opacity-80">
              {formatPercent(inv.profitLossPct, 2)}
            </span>
          </button>
        ))}
      </div>

      {selected ? (
        <section className="flex flex-col gap-2 p-4 rounded-xl bg-surface-container-low">
          <h2 className="font-headline-sm text-headline-sm font-semibold">
            {selected.name} {selected.ticker ? `(${selected.ticker})` : ""}
          </h2>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <Detail label="Cantidad" value={selected.quantity.toLocaleString("es-AR", { maximumFractionDigits: 6 })} />
            <Detail
              label="Precio actual"
              value={masked ? "$ ••••" : formatMoney(selected.currentPrice, selected.currency)}
            />
            <Detail
              label="Precio promedio"
              value={masked ? "$ ••••" : formatMoney(selected.averagePurchasePrice, selected.currency)}
            />
            <Detail
              label="Invertido"
              value={masked ? "$ ••••" : formatMoney(selected.investedCapital, selected.currency)}
            />
          </div>
          <div className="border-t border-surface-container mt-2 pt-3">
            <h3 className="font-label-md text-label-md font-semibold text-on-surface-variant mb-2">
              Historial
            </h3>
            {selected.transactions.length === 0 ? (
              <p className="text-on-surface-variant font-body-sm">Sin operaciones.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {selected.transactions.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between text-body-sm"
                  >
                    <span className="text-on-surface-variant">{t.type}</span>
                    <span className="font-numeric-list text-numeric-list text-on-surface tabular-nums">
                      {masked ? "$ ••••" : formatMoney(t.amount, t.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}

      <Link
        href="/inversiones/nuevo"
        className="w-full h-12 rounded-xl bg-primary-container text-on-primary-container font-label-md font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
      >
        <span className="material-symbols-outlined text-[20px]">add</span>
        <span>Nueva posición</span>
      </Link>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-label-sm text-label-sm text-on-surface-variant">{label}</span>
      <span className="font-body-md text-body-md font-medium text-on-surface tabular-nums">
        {value}
      </span>
    </div>
  );
}

// Helper export for the page
export { calcSubscriptionMonthlyCost };