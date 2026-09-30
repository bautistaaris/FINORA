"use client";

import Link from "next/link";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/finance";
import { PrivacyValue } from "@/components/PrivacyValue";
import { usePrivacyMode } from "@/components/PrivacyMode";
import { Logo } from "@/components/Logo";

interface Props {
  data: {
    userName: string;
    baseCurrency: string;
    privacyDefault: boolean;
    netWorth: number;
    netWorthChange: number;
    netWorthPct: number;
    monthly: {
      income: number;
      expenses: number;
      balance: number;
      savingsRate: number;
      daysElapsed: number;
    };
    weeks: { label: string; income: number; expenses: number }[];
    categoryDistribution: { name: string; value: number }[];
    upcomingBills: {
      id: string;
      name: string;
      amount: number;
      currency: string;
      nextBillingDate: string;
    }[];
  };
  recentTx: Array<{
    id: string;
    description: string;
    amount: number;
    currency: string;
    type: "EXPENSE" | "INCOME" | "TRANSFER" | "INVESTMENT";
    date: string;
    category: string | null;
    account: string | null;
  }>;
  formattedNetWorth: string;
  formattedChange: string;
  formattedIncome: string;
  formattedExpenses: string;
  formattedBalance: string;
  formattedSavingsPct: string;
}

const CATEGORY_ICONS: Record<string, string> = {
  Comida: "restaurant",
  Supermercado: "shopping_cart",
  Transporte: "directions_subway",
  Salidas: "local_bar",
  Café: "coffee",
  Salud: "medication",
  Suscripciones: "subscriptions",
  Hogar: "home",
  Compras: "shopping_bag",
};

const TX_ICONS: Record<string, string> = {
  EXPENSE: "shopping_cart",
  INCOME: "payments",
  TRANSFER: "swap_horiz",
  INVESTMENT: "currency_bitcoin",
};

const TX_COLORS: Record<string, string> = {
  EXPENSE: "text-on-surface-variant bg-surface-container-high",
  INCOME: "text-primary bg-primary/10",
  TRANSFER: "text-secondary bg-secondary/10",
  INVESTMENT: "text-tertiary bg-tertiary-container/20",
};

export function DashboardClient(props: Props) {
  const { data } = props;
  const { masked } = usePrivacyMode();

  const today = new Date();
  const greeting = greetingFor(today);
  const dateLabel = format(today, "EEEE, d 'de' MMMM", { locale: es });
  const monthLabel = format(today, "MMMM", { locale: es });
  const monthLabelCap = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1);

  const totalSpent = data.categoryDistribution.reduce((acc, c) => acc + c.value, 0);
  const maxSpent = Math.max(...data.categoryDistribution.map((c) => c.value), 1);

  return (
    <div className="flex flex-col w-full gap-y-4 animate-fade-in-up">
      {/* Header saludo */}
      <section className="flex items-center justify-between pt-1">
        <div className="flex flex-col">
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">
            {dateLabel}
          </span>
          <h1 className="font-headline-sm text-headline-sm font-semibold text-on-surface tracking-tight">
            {greeting}, {data.userName}
          </h1>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-container-high">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">
            Sincronizado
          </span>
        </div>
      </section>

      {/* Patrimonio */}
      <section className="relative overflow-hidden rounded-xl bg-gradient-to-br from-surface-container-high via-surface-container to-surface-container-low p-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="font-label-md text-label-md text-on-surface-variant">
              Patrimonio total
            </span>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-secondary text-label-sm font-label-sm">
            {data.baseCurrency}
          </span>
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-numeric-hero-mobile text-numeric-hero-mobile font-semibold tracking-tight text-on-surface tabular-nums">
            {masked ? "$ ••••••" : props.formattedNetWorth}
          </span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 rounded-full",
              data.netWorthChange >= 0 ? "bg-primary/10 text-primary" : "bg-error/10 text-error",
            )}
          >
            <span className="material-symbols-outlined text-[16px] font-bold">
              {data.netWorthChange >= 0 ? "trending_up" : "trending_down"}
            </span>
            <span className="font-label-md text-label-md font-semibold tabular-nums">
              {data.netWorthChange >= 0 ? "+" : ""}
              {masked
                ? "$ ••••"
                : formatMoney(Math.abs(data.netWorthChange), data.baseCurrency)}{" "}
              este mes ({data.netWorthPct >= 0 ? "+" : ""}
              {(data.netWorthPct * 100).toFixed(1)}%)
            </span>
          </div>
        </div>
      </section>

      {/* Resumen del mes */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between px-1">
          <span className="font-label-sm text-label-sm font-semibold tracking-wider text-outline uppercase">
            Resumen de {monthLabelCap}
          </span>
          <span className="font-label-sm text-label-sm text-secondary">
            {data.monthly.daysElapsed} días computados
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <MetricCard
            label="Ingresos"
            icon="arrow_downward"
            iconColor="text-primary bg-primary/10"
            value={
              <PrivacyValue
                value={data.monthly.income}
                currency={data.baseCurrency}
                className="font-numeric-card text-numeric-card font-semibold text-primary"
              />
            }
          />
          <MetricCard
            label="Gastos"
            icon="arrow_upward"
            iconColor="text-error bg-error/10"
            value={
              <PrivacyValue
                value={data.monthly.expenses}
                currency={data.baseCurrency}
                className="font-numeric-card text-numeric-card font-semibold text-error"
              />
            }
          />
          <MetricCard
            label="Balance Neto"
            icon="account_balance_wallet"
            iconColor="text-secondary bg-secondary-container/50"
            value={
              <PrivacyValue
                value={data.monthly.balance}
                currency={data.baseCurrency}
                className={cn(
                  "font-numeric-card text-numeric-card font-semibold",
                  data.monthly.balance >= 0 ? "text-on-surface" : "text-error",
                )}
              />
            }
          />
          <div className="flex flex-col justify-between p-3.5 rounded-xl bg-surface-container-low shadow-sm">
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-medium">
                Tasa de Ahorro
              </span>
              <span className="font-label-sm text-label-sm text-primary font-semibold">
                Meta 30%
              </span>
            </div>
            <div className="mt-2">
              <div className="flex items-baseline justify-between">
                <span className="font-numeric-card text-numeric-card font-semibold text-primary tabular-nums">
                  {masked ? "••%" : props.formattedSavingsPct}
                </span>
                <span className="font-label-sm text-label-sm text-primary">
                  {data.monthly.savingsRate >= 0.3
                    ? "Óptimo"
                    : data.monthly.savingsRate >= 0.1
                      ? "En meta"
                      : "Bajo"}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-surface-container-highest mt-2 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(Math.max(data.monthly.savingsRate * 100, 0), 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Flujo semanal */}
      <section className="flex flex-col gap-2 p-4 rounded-xl bg-surface-container-low shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px] text-tertiary">
              query_stats
            </span>
            <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
              Flujo Semanal
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-primary" />
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                Ingresos
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-error" />
              <span className="font-label-sm text-label-sm text-on-surface-variant">
                Gastos
              </span>
            </div>
          </div>
        </div>

        <div className="pt-2">
          <div className="flex justify-between items-end h-28 gap-2 px-1">
            {data.weeks.map((w, i) => {
              const max = Math.max(
                ...data.weeks.flatMap((x) => [x.income, x.expenses]),
                1,
              );
              const iH = (w.income / max) * 100;
              const eH = (w.expenses / max) * 100;
              const isCurrent = i === data.weeks.length - 1;
              return (
                <div
                  key={i}
                  className={cn(
                    "flex-1 flex flex-col items-center gap-1.5 h-full justify-end",
                    isCurrent && "rounded-lg bg-surface-container/60 p-1",
                  )}
                >
                  <div className="w-full flex items-end justify-center gap-1 h-20">
                    <div
                      className="w-2.5 rounded-t-sm bg-primary/90 transition-all duration-300"
                      style={{ height: `${iH}%` }}
                    />
                    <div
                      className={cn(
                        "w-2.5 rounded-t-sm transition-all duration-300",
                        isCurrent ? "bg-error" : "bg-error/80",
                      )}
                      style={{ height: `${eH}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      "font-label-sm text-label-sm",
                      isCurrent
                        ? "text-primary font-semibold"
                        : "text-outline",
                    )}
                  >
                    {w.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Gastos por categoría */}
      <section className="flex flex-col gap-3 p-4 rounded-xl bg-surface-container-low shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
              Gastos por Categoría
            </h2>
            <span className="font-body-sm text-body-sm text-on-surface-variant">
              Distribución del total ejecutado
            </span>
          </div>
          <Link
            href="/movimientos?filter=expenses"
            className="font-label-md text-label-md text-primary font-medium px-2 py-1 rounded hover:bg-surface-container-high transition-colors"
          >
            Ver desglose
          </Link>
        </div>

        {data.categoryDistribution.length === 0 ? (
          <div className="text-center text-on-surface-variant py-6 font-body-sm">
            Sin gastos este mes todavía.
          </div>
        ) : (
          <div className="flex flex-col gap-3 mt-1">
            {data.categoryDistribution.map((cat, i) => {
              const pct = totalSpent > 0 ? cat.value / totalSpent : 0;
              const barColor =
                i % 3 === 0 ? "bg-primary" : i % 3 === 1 ? "bg-secondary" : "bg-tertiary";
              return (
                <div key={cat.name} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center text-secondary">
                        <span className="material-symbols-outlined text-[18px]">
                          {CATEGORY_ICONS[cat.name] ?? "category"}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="font-body-md text-body-md font-medium text-on-surface">
                          {cat.name}
                        </span>
                        <span className="font-label-sm text-label-sm text-outline">
                          {(pct * 100).toFixed(0)}% del gasto
                        </span>
                      </div>
                    </div>
                    <PrivacyValue
                      value={cat.value}
                      currency={data.baseCurrency}
                      className="font-numeric-list text-numeric-list font-semibold text-on-surface"
                    />
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-surface-container-highest overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", barColor)}
                      style={{ width: `${(cat.value / maxSpent) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Últimos movimientos */}
      <section className="flex flex-col gap-2.5 p-4 rounded-xl bg-surface-container-low shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[20px] text-primary">
              history
            </span>
            <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
              Últimos Movimientos
            </h2>
          </div>
          <Link
            href="/movimientos"
            className="font-label-md text-label-md text-primary font-medium hover:underline"
          >
            Ver todos
          </Link>
        </div>

        {props.recentTx.length === 0 ? (
          <div className="text-center text-on-surface-variant py-6 font-body-sm">
            <Logo size={20} />
            <p className="mt-2">Sin movimientos registrados.</p>
            <Link
              href="/movimientos/nuevo"
              className="text-primary hover:underline mt-1 inline-block"
            >
              Registrar el primero
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2 mt-1">
            {props.recentTx.map((tx) => (
              <TxRow key={tx.id} tx={tx} baseCurrency={data.baseCurrency} />
            ))}
          </div>
        )}
      </section>

      {/* Próximos cobros */}
      {data.upcomingBills.length > 0 ? (
        <section className="flex flex-col gap-2.5 p-4 rounded-xl bg-surface-container-low shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[20px] text-tertiary">
                event_upcoming
              </span>
              <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                Próximos Cobros
              </h2>
            </div>
            <Link
              href="/suscripciones"
              className="font-label-md text-label-md text-primary font-medium hover:underline"
            >
              Ver todos
            </Link>
          </div>
          <div className="flex flex-col gap-2 mt-1">
            {data.upcomingBills.map((bill) => (
              <div
                key={bill.id}
                className="flex items-center justify-between p-2.5 rounded-lg bg-surface-container/60"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-tertiary-container/20 flex items-center justify-center text-tertiary shrink-0">
                    <span className="material-symbols-outlined text-[20px]">
                      subscriptions
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-body-md text-body-md font-medium text-on-surface truncate">
                      {bill.name}
                    </span>
                    <span className="font-body-sm text-body-sm text-outline">
                      {format(parseISO(bill.nextBillingDate), "d 'de' MMM", {
                        locale: es,
                      })}
                    </span>
                  </div>
                </div>
                <PrivacyValue
                  value={bill.amount}
                  currency={bill.currency}
                  className="font-numeric-list text-numeric-list font-semibold text-on-surface"
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Insight */}
      <section className="flex items-center gap-3 p-3.5 rounded-xl bg-surface-container-low shadow-sm">
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
          <span className="material-symbols-outlined text-[20px]">auto_awesome</span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-label-md text-label-md font-semibold text-on-surface">
            Ritmo de ahorro
          </span>
          <span className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
            {data.monthly.savingsRate >= 0.2
              ? "Vas por encima del ritmo del mes pasado. Seguí así."
              : data.monthly.savingsRate >= 0
                ? "Estás en equilibrio. Buscá recortes en salidas y suscripciones."
                : "Estás gastando más de lo que ingresa este mes. Revisá categorías."}
          </span>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  label,
  icon,
  iconColor,
  value,
}: {
  label: string;
  icon: string;
  iconColor: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between p-3.5 rounded-xl bg-surface-container-low shadow-sm">
      <div className="flex items-center justify-between">
        <span className="font-label-sm text-label-sm text-on-surface-variant uppercase font-medium">
          {label}
        </span>
        <div
          className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center",
            iconColor,
          )}
        >
          <span className="material-symbols-outlined text-[15px]">{icon}</span>
        </div>
      </div>
      <div className="mt-2">{value}</div>
    </div>
  );
}

function TxRow({
  tx,
  baseCurrency,
}: {
  tx: Props["recentTx"][number];
  baseCurrency: string;
}) {
  const icon = TX_ICONS[tx.type] ?? "swap_horiz";
  const colorCls = TX_COLORS[tx.type] ?? "text-on-surface-variant bg-surface-container-high";
  const sign = tx.type === "INCOME" ? "+" : tx.type === "EXPENSE" ? "-" : "";
  const color =
    tx.type === "INCOME"
      ? "text-primary"
      : tx.type === "INVESTMENT"
        ? "text-tertiary"
        : "text-on-surface";
  return (
    <div className="flex items-center justify-between p-2.5 rounded-lg bg-surface-container/60 hover:bg-surface-container transition-colors active:scale-[0.99]">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
            colorCls,
          )}
        >
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-body-md text-body-md font-medium text-on-surface truncate">
            {tx.description}
          </span>
          <span className="font-body-sm text-body-sm text-outline truncate">
            {tx.category ? `${tx.category} · ` : ""}
            {format(parseISO(tx.date), "d MMM", { locale: es })}
            {tx.account ? ` · ${tx.account}` : ""}
          </span>
        </div>
      </div>
      <div className="text-right pl-2 shrink-0">
        <span className={cn("font-numeric-list text-numeric-list font-semibold", color)}>
          {sign}
        </span>
        <PrivacyValue
          value={Math.abs(tx.amount)}
          currency={tx.currency}
          className={cn("font-numeric-list text-numeric-list font-semibold", color)}
        />
      </div>
    </div>
  );
}

function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 6) return "Buenas noches";
  if (h < 13) return "Buen día";
  if (h < 20) return "Buenas tardes";
  return "Buenas noches";
}