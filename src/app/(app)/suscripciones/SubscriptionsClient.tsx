"use client";

import { useState } from "react";
import { format, parseISO, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/finance";
import { usePrivacyMode } from "@/components/PrivacyMode";
import { EmptyState } from "@/components/States";

interface SubItem {
  id: string;
  name: string;
  amount: number;
  currency: string;
  frequency: "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM";
  customDays: number | null;
  nextBillingDate: string;
  status: "ACTIVE" | "PAUSED" | "CANCELLED";
  monthlyEquivalent: number;
  annualEquivalent: number;
}

const FREQ_LABEL: Record<string, string> = {
  WEEKLY: "Semanal",
  MONTHLY: "Mensual",
  QUARTERLY: "Trimestral",
  YEARLY: "Anual",
  CUSTOM: "Personalizado",
};

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "bg-primary/10 text-primary",
  PAUSED: "bg-secondary/10 text-secondary",
  CANCELLED: "bg-error/10 text-error",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Activa",
  PAUSED: "Pausada",
  CANCELLED: "Cancelada",
};

export function SubscriptionsClient({
  subscriptions,
  baseCurrency,
  totalMonthlyConverted,
}: {
  subscriptions: SubItem[];
  baseCurrency: string;
  totalMonthlyConverted: number;
}) {
  const { masked } = usePrivacyMode();
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<"all" | "ACTIVE" | "PAUSED" | "CANCELLED">("all");

  const filtered = subscriptions.filter((s) =>
    filter === "all" ? true : s.status === filter,
  );

  const updateStatus = async (id: string, status: SubItem["status"]) => {
    await fetch(`/api/subscriptions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    window.location.reload();
  };

  return (
    <div className="flex flex-col gap-space-md text-on-surface">
      <header className="pt-1">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-semibold tracking-tight">
          Suscripciones
        </h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          Costo mensual total
        </p>
        <div className="mt-2 p-3 rounded-xl bg-surface-container-low">
          <div className="flex items-baseline justify-between">
            <span className="font-numeric-card text-numeric-card font-semibold tabular-nums">
              {masked ? "$ •••••" : formatMoney(totalMonthlyConverted, baseCurrency)}
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {subscriptions.filter((s) => s.status === "ACTIVE").length} activas
            </span>
          </div>
        </div>
      </header>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
        {(["all", "ACTIVE", "PAUSED", "CANCELLED"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "whitespace-nowrap flex items-center gap-1.5 px-3.5 h-8 rounded-full font-label-md text-label-md font-medium transition-all shrink-0",
              filter === f
                ? "bg-primary-container text-on-primary font-semibold shadow-sm"
                : "bg-surface-container-low text-on-surface-variant hover:text-on-surface",
            )}
          >
            {f === "all" ? "Todas" : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="subscriptions"
          title="Sin suscripciones"
          description="Registrá tus suscripciones para trackear el costo recurrente."
          action={
            <button
              onClick={() => setShowAdd(true)}
              className="px-4 py-2 bg-primary text-on-primary rounded-lg font-label-md"
            >
              Agregar
            </button>
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((s) => {
            const days = differenceInDays(parseISO(s.nextBillingDate), new Date());
            return (
              <div
                key={s.id}
                className="flex items-center justify-between p-3.5 rounded-xl bg-surface-container-low"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-11 h-11 rounded-xl bg-surface-container-high flex items-center justify-center text-primary shrink-0">
                    <span className="material-symbols-outlined text-[22px]">
                      subscriptions
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-body-md text-body-md font-medium text-on-surface truncate">
                      {s.name}
                    </span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant truncate">
                      {FREQ_LABEL[s.frequency]}
                      {" · "}
                      {days >= 0
                        ? `Próximo cobro en ${days}d`
                        : `Vencida hace ${Math.abs(days)}d`}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center self-start mt-1 px-1.5 py-0.5 rounded-full font-label-sm text-label-sm font-semibold",
                        STATUS_COLOR[s.status],
                      )}
                    >
                      {STATUS_LABEL[s.status]}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className="font-numeric-list text-numeric-list font-semibold tabular-nums text-on-surface">
                    {masked ? "$ ••••" : formatMoney(s.amount, s.currency)}
                  </span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant tabular-nums">
                    ≈ {masked ? "$ ••" : formatMoney(s.monthlyEquivalent, s.currency)} / mes
                  </span>
                  <div className="flex gap-1 mt-1">
                    {s.status === "ACTIVE" ? (
                      <button
                        onClick={() => updateStatus(s.id, "PAUSED")}
                        className="font-label-sm text-label-sm text-secondary hover:underline"
                      >
                        Pausar
                      </button>
                    ) : s.status === "PAUSED" ? (
                      <button
                        onClick={() => updateStatus(s.id, "ACTIVE")}
                        className="font-label-sm text-label-sm text-primary hover:underline"
                      >
                        Reanudar
                      </button>
                    ) : null}
                    {s.status !== "CANCELLED" ? (
                      <button
                        onClick={() => updateStatus(s.id, "CANCELLED")}
                        className="font-label-sm text-label-sm text-error hover:underline"
                      >
                        Cancelar
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => setShowAdd(true)}
        className="w-full h-12 rounded-xl bg-primary-container text-on-primary-container font-label-md text-label-md font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
      >
        <span className="material-symbols-outlined text-[20px]">add</span>
        <span>Nueva suscripción</span>
      </button>

      {showAdd ? (
        <AddSubscriptionModal
          baseCurrency={baseCurrency}
          onClose={() => setShowAdd(false)}
        />
      ) : null}
    </div>
  );
}

function AddSubscriptionModal({
  baseCurrency,
  onClose,
}: {
  baseCurrency: string;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("0");
  const [currency, setCurrency] = useState(baseCurrency);
  const [frequency, setFrequency] = useState<"WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM">("MONTHLY");
  const [nextBillingDate, setNextBillingDate] = useState(
    format(new Date(Date.now() + 7 * 24 * 3600 * 1000), "yyyy-MM-dd"),
  );
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name || Number(amount) <= 0) {
      setError("Completá nombre e importe.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          amount: Number(amount),
          currency,
          frequency,
          nextBillingDate: new Date(nextBillingDate).toISOString(),
          status: "ACTIVE",
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
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full bg-surface-container rounded-t-3xl p-margin-mobile flex flex-col gap-space-md shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="w-10 h-1 bg-outline-variant/50 rounded-full mx-auto -mt-1 mb-1" />
        <div className="flex items-center justify-between">
          <h2 className="font-headline-sm text-headline-sm font-semibold">Nueva suscripción</h2>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-surface-container-high flex items-center justify-center"
            aria-label="Cerrar"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <Field label="Nombre">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Netflix"
            className="w-full h-12 px-3 bg-surface-container-highest rounded-lg font-body-md text-body-md text-on-surface focus:outline-none"
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Importe">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full h-12 px-3 bg-surface-container-highest rounded-lg font-body-md text-body-md text-on-surface focus:outline-none"
            />
          </Field>
          <Field label="Moneda">
            <div className="grid grid-cols-2 gap-2">
              {(["ARS", "USD"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className={cn(
                    "py-2 rounded-lg font-label-md text-label-md font-semibold",
                    currency === c
                      ? "bg-primary text-on-primary"
                      : "bg-surface-container-high text-on-surface-variant",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <Field label="Frecuencia">
          <div className="grid grid-cols-3 gap-2">
            {(["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFrequency(f)}
                className={cn(
                  "py-2 rounded-lg font-label-md text-label-md font-semibold",
                  frequency === f
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container-high text-on-surface-variant",
                )}
              >
                {FREQ_LABEL[f]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Próximo cobro">
          <input
            type="date"
            value={nextBillingDate}
            onChange={(e) => setNextBillingDate(e.target.value)}
            className="w-full h-12 px-3 bg-surface-container-highest rounded-lg font-body-md text-body-md text-on-surface focus:outline-none"
          />
        </Field>

        {error ? (
          <div className="text-error font-body-sm bg-error-container/30 p-2 rounded-lg">{error}</div>
        ) : null}

        <button
          onClick={submit}
          disabled={creating}
          className="w-full h-12 rounded-xl bg-primary text-on-primary font-headline-sm font-semibold disabled:opacity-50"
        >
          {creating ? "Creando…" : "Crear suscripción"}
        </button>
      </div>
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