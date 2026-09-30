"use client";

import { useMemo, useState } from "react";
import { format, parseISO, isWithinInterval } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/finance";
import { PrivacyValue } from "@/components/PrivacyValue";
import { usePrivacyMode } from "@/components/PrivacyMode";
import { EmptyState } from "@/components/States";
import { PeriodSelector, periodToRange } from "@/components/PeriodSelector";

interface TxItem {
  id: string;
  description: string;
  amount: number;
  currency: string;
  type: "EXPENSE" | "INCOME" | "TRANSFER" | "INVESTMENT";
  date: string;
  category: string | null;
  account: string | null;
  categoryId: string | null;
  accountId: string;
}

interface AccountOpt {
  id: string;
  name: string;
  currency: string;
}

type FilterType = "all" | "EXPENSE" | "INCOME" | "INVESTMENT" | "TRANSFER";

const CATEGORY_ICONS: Record<string, string> = {
  Comida: "restaurant",
  Café: "coffee",
  Transporte: "local_gas_station",
  Salud: "medication",
  Supermercado: "shopping_cart",
  Suscripciones: "movie",
  Trabajo: "payments",
};

const TX_ICONS: Record<string, string> = {
  EXPENSE: "arrow_outward",
  INCOME: "arrow_downward",
  INVESTMENT: "query_stats",
  TRANSFER: "swap_horiz",
};

const TX_COLORS: Record<string, string> = {
  EXPENSE: "text-error bg-surface-container-high",
  INCOME: "text-primary bg-primary-container/20",
  INVESTMENT: "text-tertiary bg-tertiary-container/30",
  TRANSFER: "text-secondary bg-secondary-container/40",
};

const TX_BADGE_COLORS: Record<string, string> = {
  EXPENSE: "bg-surface-container text-on-surface-variant",
  INCOME: "bg-primary/10 text-primary",
  INVESTMENT: "bg-tertiary/10 text-tertiary",
  TRANSFER: "bg-secondary/10 text-secondary",
};

const TX_BADGE_LABELS: Record<string, string> = {
  EXPENSE: "Gasto",
  INCOME: "Ingreso",
  INVESTMENT: "Inversión",
  TRANSFER: "Transferencia",
};

export function MovementsClient({
  initial,
  accounts,
}: {
  initial: TxItem[];
  accounts: AccountOpt[];
}) {
  const [periodValue, setPeriodValue] = useState("month");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<{
    accountId: string | null;
    currency: string | null;
    maxAmount: number | null;
  }>({ accountId: null, currency: null, maxAmount: null });

  const { masked } = usePrivacyMode();

  const range = useMemo(() => periodToRange(periodValue), [periodValue]);

  const filtered = useMemo(() => {
    return initial.filter((tx) => {
      const date = parseISO(tx.date);
      if (!isWithinInterval(date, { start: range.start, end: range.end })) {
        return false;
      }
      if (filter !== "all" && tx.type !== filter) return false;
      if (
        search &&
        ![tx.description, tx.category ?? "", tx.account ?? ""].some((s) =>
          s.toLowerCase().includes(search.toLowerCase()),
        )
      )
        return false;
      if (advancedFilters.accountId && tx.accountId !== advancedFilters.accountId)
        return false;
      if (advancedFilters.currency && tx.currency !== advancedFilters.currency)
        return false;
      if (advancedFilters.maxAmount && Math.abs(tx.amount) > advancedFilters.maxAmount)
        return false;
      return true;
    });
  }, [initial, range, filter, search, advancedFilters]);

  // Group by date
  const groups = useMemo(() => {
    const map = new Map<string, TxItem[]>();
    for (const tx of filtered) {
      const d = parseISO(tx.date);
      const key = format(d, "yyyy-MM-dd");
      const arr = map.get(key) ?? [];
      arr.push(tx);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([key, items]) => {
      const date = parseISO(items[0]!.date);
      const income = items
        .filter((t) => t.type === "INCOME")
        .reduce((acc, t) => acc + t.amount, 0);
      const expenses = items
        .filter((t) => t.type === "EXPENSE" || t.type === "INVESTMENT")
        .reduce((acc, t) => acc + t.amount, 0);
      const net = income - expenses;
      return {
        key,
        date,
        items,
        totalIncome: income,
        totalExpenses: expenses,
        net,
      };
    });
  }, [filtered]);

  // Header totals (per period)
  const periodIncome = filtered
    .filter((t) => t.type === "INCOME")
    .reduce((acc, t) => acc + t.amount, 0);
  const periodExpenses = filtered
    .filter((t) => t.type === "EXPENSE" || t.type === "INVESTMENT")
    .reduce((acc, t) => acc + t.amount, 0);
  const periodBalance = periodIncome - periodExpenses;
  const isSurplus = periodBalance >= 0;

  const baseCurrency = filtered[0]?.currency ?? "ARS";

  return (
    <div className="flex flex-col w-full gap-space-md text-on-surface">
      {/* Period summary */}
      <section className="flex flex-col bg-surface-container-low rounded-xl p-space-md shadow-md gap-space-sm relative overflow-hidden">
        <div className="absolute -right-12 -top-12 w-36 h-36 rounded-full bg-primary/5 blur-2xl pointer-events-none" />
        <div className="flex items-center justify-between z-10">
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
              Historial
            </span>
            <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-semibold text-on-surface tracking-tight">
              Movimientos
            </h1>
          </div>
          <PeriodSelector value={periodValue} onChange={setPeriodValue} />
        </div>
        <div className="flex flex-col bg-surface-container rounded-lg p-3 gap-2 mt-1 z-10">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              Balance neto
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 font-label-sm text-label-sm font-semibold px-2 py-0.5 rounded-full",
                isSurplus
                  ? "bg-primary-container/20 text-primary"
                  : "bg-error/15 text-error",
              )}
            >
              <span className="material-symbols-outlined text-[13px]">
                {isSurplus ? "trending_up" : "trending_down"}
              </span>
              {isSurplus ? "Superávit" : "Déficit"}
            </span>
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className={cn(
                "font-numeric-hero-mobile text-numeric-hero-mobile font-bold tracking-tight tabular-nums",
                isSurplus ? "text-primary" : "text-error",
              )}
            >
              {masked
                ? "$ ••••••"
                : `${isSurplus ? "+" : ""}${formatMoney(Math.abs(periodBalance), baseCurrency, { signed: false })}`}
            </span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              {baseCurrency}
            </span>
          </div>
          <div className="flex items-center justify-between pt-2 mt-0.5 border-t-0 bg-surface-container-high/40 px-2.5 py-1.5 rounded-md text-on-surface-variant">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary" />
              <span className="font-body-sm text-body-sm">Ingresos:</span>
              <PrivacyValue
                value={periodIncome}
                currency={baseCurrency}
                className="font-numeric-list text-numeric-list font-semibold text-on-surface"
              />
            </div>
            <div className="w-1 h-3 bg-outline-variant/30 rounded-full" />
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-error" />
              <span className="font-body-sm text-body-sm">Gastos:</span>
              <PrivacyValue
                value={periodExpenses}
                currency={baseCurrency}
                className="font-numeric-list text-numeric-list font-semibold text-on-surface"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Search */}
      <section className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[20px] text-outline">
            search
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, categoría o cuenta..."
            className="w-full h-12 bg-surface-container-low text-on-surface placeholder:text-outline pl-11 pr-9 rounded-xl font-body-sm text-body-sm outline-none focus:bg-surface-container transition-all"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface"
              aria-label="Limpiar búsqueda"
            >
              <span className="material-symbols-outlined text-[18px]">cancel</span>
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setFilterModalOpen(true)}
          aria-label="Filtros avanzados"
          className="flex items-center justify-center w-12 h-12 rounded-xl bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface active:scale-95 transition-all relative"
        >
          <span className="material-symbols-outlined text-[20px]">tune</span>
          {(advancedFilters.accountId ||
            advancedFilters.currency ||
            advancedFilters.maxAmount) ? (
            <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-primary" />
          ) : null}
        </button>
      </section>

      {/* Chips */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 -mx-margin-mobile px-margin-mobile">
        <Chip active={filter === "all"} onClick={() => setFilter("all")} label="Todos" count={initial.length} />
        <Chip
          active={filter === "EXPENSE"}
          onClick={() => setFilter("EXPENSE")}
          label="Gastos"
          icon="arrow_outward"
          iconColor="text-error"
        />
        <Chip
          active={filter === "INCOME"}
          onClick={() => setFilter("INCOME")}
          label="Ingresos"
          icon="arrow_downward"
          iconColor="text-primary"
        />
        <Chip
          active={filter === "INVESTMENT"}
          onClick={() => setFilter("INVESTMENT")}
          label="Inversiones"
          icon="query_stats"
          iconColor="text-tertiary"
        />
        <Chip
          active={filter === "TRANSFER"}
          onClick={() => setFilter("TRANSFER")}
          label="Transferencias"
          icon="swap_horiz"
          iconColor="text-secondary"
        />
      </div>

      {/* Feed */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="search_off"
          title="Sin movimientos que coincidan"
          description="Probá quitando filtros de búsqueda o cambiando el rango temporal."
          action={
            <button
              onClick={() => {
                setSearch("");
                setFilter("all");
                setAdvancedFilters({
                  accountId: null,
                  currency: null,
                  maxAmount: null,
                });
              }}
              className="px-4 py-2 bg-surface-container-high hover:bg-surface-container-highest text-primary font-label-md text-label-md rounded-lg transition-colors"
            >
              Restablecer filtros
            </button>
          }
        />
      ) : (
        <div className="flex flex-col gap-space-md">
          {groups.map((group) => (
            <div key={group.key} className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <span className="font-label-sm text-label-sm font-semibold tracking-wider uppercase text-on-surface-variant">
                  {groupHeader(group.date, new Date())}
                </span>
                <span
                  className={cn(
                    "font-label-sm text-label-sm font-medium",
                    group.net >= 0 ? "text-primary" : "text-on-surface-variant",
                  )}
                >
                  {group.net >= 0 ? "+" : ""}
                  {formatMoney(Math.abs(group.net), baseCurrency, { signed: false })} neto
                </span>
              </div>
              <div className="flex flex-col bg-surface-container-low rounded-xl overflow-hidden shadow-sm">
                {group.items.map((tx, idx) => (
                  <div key={tx.id}>
                    <TxRow tx={tx} />
                    {idx < group.items.length - 1 ? (
                      <div className="h-[1px] bg-surface-container ml-14 mr-3" />
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {filterModalOpen ? (
        <FilterModal
          accounts={accounts}
          value={advancedFilters}
          onClose={() => setFilterModalOpen(false)}
          onApply={(v) => {
            setAdvancedFilters(v);
            setFilterModalOpen(false);
          }}
          onClear={() => {
            setAdvancedFilters({
              accountId: null,
              currency: null,
              maxAmount: null,
            });
            setFilterModalOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function Chip({
  active,
  onClick,
  label,
  count,
  icon,
  iconColor,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  icon?: string;
  iconColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "whitespace-nowrap flex items-center gap-1.5 px-3.5 h-8 rounded-full font-label-md text-label-md font-medium transition-all shrink-0",
        active
          ? "bg-primary-container text-on-primary font-semibold shadow-sm"
          : "bg-surface-container-low text-on-surface-variant hover:text-on-surface",
      )}
    >
      {icon ? (
        <span className={cn("material-symbols-outlined text-[15px]", iconColor)}>
          {icon}
        </span>
      ) : null}
      <span>{label}</span>
      {count !== undefined ? (
        <span
          className={cn(
            "px-1.5 py-0.2 rounded-full font-label-sm text-label-sm",
            active ? "bg-on-primary/20" : "bg-surface-container-high",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function TxRow({ tx }: { tx: TxItem }) {
  const date = parseISO(tx.date);
  const icon = CATEGORY_ICONS[tx.category ?? ""] ?? TX_ICONS[tx.type] ?? "swap_horiz";
  const colorCls = TX_COLORS[tx.type] ?? TX_COLORS.EXPENSE!;
  const badgeCls = TX_BADGE_COLORS[tx.type] ?? TX_BADGE_COLORS.EXPENSE!;
  const badgeLabel = TX_BADGE_LABELS[tx.type] ?? tx.type;
  const amountSign =
    tx.type === "INCOME" ? "+" : tx.type === "EXPENSE" ? "-" : "";
  const amountColor =
    tx.type === "INCOME"
      ? "text-primary"
      : tx.type === "INVESTMENT"
        ? "text-tertiary"
        : tx.type === "TRANSFER"
          ? "text-secondary"
          : "text-on-surface";

  return (
    <div className="flex items-center justify-between p-3.5 hover:bg-surface-container transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
            colorCls,
          )}
        >
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-body-md text-body-md font-medium text-on-surface truncate">
            {tx.description}
          </span>
          <div className="flex items-center gap-1.5 text-on-surface-variant font-body-sm text-body-sm">
            <span
              className={cn(
                "px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold",
                badgeCls,
              )}
            >
              {badgeLabel}
            </span>
            {tx.category && tx.type !== "INCOME" && tx.type !== "INVESTMENT" ? (
              <>
                <span>·</span>
                <span className="truncate">{tx.category}</span>
              </>
            ) : null}
            <span>·</span>
            <span>{format(date, "HH:mm")}</span>
            {tx.account ? (
              <>
                <span>·</span>
                <span className="truncate">{tx.account}</span>
              </>
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end shrink-0 pl-2">
        <span
          className={cn(
            "font-numeric-list text-numeric-list font-semibold tabular-nums",
            amountColor,
          )}
        >
          {amountSign}
          <PrivacyValueInline value={Math.abs(tx.amount)} currency={tx.currency} />
        </span>
        <span className="font-label-sm text-label-sm text-on-surface-variant">
          {tx.currency}
        </span>
      </div>
    </div>
  );
}

function PrivacyValueInline({
  value,
  currency,
}: {
  value: number;
  currency: string;
}) {
  const { masked } = usePrivacyMode();
  if (masked) return <>••••</>;
  return <>{formatMoney(value, currency, { showSymbol: false })}</>;
}

function groupHeader(date: Date, now: Date): string {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return `Hoy — ${format(date, "d MMM", { locale: es })}`;
  if (diff === 1) return `Ayer — ${format(date, "d MMM", { locale: es })}`;
  return format(date, "d MMM", { locale: es });
}

function FilterModal({
  accounts,
  value,
  onClose,
  onApply,
  onClear,
}: {
  accounts: AccountOpt[];
  value: { accountId: string | null; currency: string | null; maxAmount: number | null };
  onClose: () => void;
  onApply: (v: typeof value) => void;
  onClear: () => void;
}) {
  const [local, setLocal] = useState(value);
  const [maxStr, setMaxStr] = useState(
    local.maxAmount ? local.maxAmount.toString() : "1000000",
  );
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full bg-surface-container rounded-t-3xl p-margin-mobile flex flex-col gap-space-md shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="w-10 h-1 bg-outline-variant/50 rounded-full mx-auto -mt-1 mb-1" />
        <div className="flex items-center justify-between">
          <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
            Filtros Avanzados
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-9 h-9 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <label className="font-label-md text-label-md text-on-surface-variant font-medium">
            Cuenta o billetera
          </label>
          <div className="flex flex-wrap gap-2">
            <Pill
              active={!local.accountId}
              onClick={() => setLocal({ ...local, accountId: null })}
            >
              Todas
            </Pill>
            {accounts.map((a) => (
              <Pill
                key={a.id}
                active={local.accountId === a.id}
                onClick={() => setLocal({ ...local, accountId: a.id })}
              >
                {a.name}
              </Pill>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="font-label-md text-label-md text-on-surface-variant font-medium">
            Moneda
          </label>
          <div className="grid grid-cols-3 gap-2">
            <Pill
              active={!local.currency}
              onClick={() => setLocal({ ...local, currency: null })}
              block
            >
              Todas
            </Pill>
            {(["ARS", "USD"] as const).map((c) => (
              <Pill
                key={c}
                active={local.currency === c}
                onClick={() => setLocal({ ...local, currency: c })}
                block
              >
                {c}
              </Pill>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="font-label-md text-label-md text-on-surface-variant font-medium">
              Importe máximo
            </label>
            <span className="font-label-sm text-label-sm text-primary">
              Hasta ${Number(maxStr || 0).toLocaleString("es-AR")}
            </span>
          </div>
          <input
            type="range"
            min={1000}
            max={5000000}
            step={10000}
            value={Number(maxStr || 1000000)}
            onChange={(e) => setMaxStr(e.target.value)}
            className="w-full accent-primary bg-surface-container-high h-2 rounded-lg cursor-pointer"
          />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={onClear}
            className="flex-1 py-3 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-label-md text-label-md font-semibold transition-all"
          >
            Limpiar
          </button>
          <button
            onClick={() =>
              onApply({
                accountId: local.accountId,
                currency: local.currency,
                maxAmount: Number(maxStr) > 0 ? Number(maxStr) : null,
              })
            }
            className="flex-1 py-3 rounded-xl bg-primary text-on-primary font-label-md text-label-md font-semibold shadow-md active:scale-98 transition-all"
          >
            Aplicar filtros
          </button>
        </div>
      </div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
  block,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  block?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-lg font-label-md text-label-md font-medium transition-colors",
        block && "text-center",
        active
          ? "bg-surface-container-high text-primary"
          : "bg-surface-container-lowest text-on-surface-variant",
      )}
    >
      {children}
    </button>
  );
}