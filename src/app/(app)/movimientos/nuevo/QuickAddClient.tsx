"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { cn } from "@/lib/utils";

type TxKind = "EXPENSE" | "INCOME" | "INVESTMENT" | "TRANSFER";

interface Account {
  id: string;
  name: string;
  currency: string;
  currentBalance: number;
  type: string;
}

interface Category {
  id: string;
  name: string;
  type: string;
  icon: string | null;
}

interface Props {
  accounts: Account[];
  categories: Category[];
  subscriptions: { id: string; name: string; amount: number; currency: string; frequency: string }[];
  investments: { id: string; name: string; ticker: string | null; assetType: string; currency: string }[];
}

const CURRENCIES = ["ARS", "USD"] as const;

const TYPE_LABEL: Record<TxKind, string> = {
  EXPENSE: "Gasto",
  INCOME: "Ingreso",
  INVESTMENT: "Inversión",
  TRANSFER: "Transferir",
};

const TYPE_ICON: Record<TxKind, string> = {
  EXPENSE: "arrow_outward",
  INCOME: "south_west",
  INVESTMENT: "trending_up",
  TRANSFER: "sync_alt",
};

export function QuickAddClient({ accounts, categories, subscriptions, investments }: Props) {
  const router = useRouter();
  const [kind, setKind] = useState<TxKind>("EXPENSE");
  const [amountStr, setAmountStr] = useState("0");
  const [currency, setCurrency] = useState<string>("ARS");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(accounts[0]?.id ?? null);
  const [destAccountId, setDestAccountId] = useState<string | null>(accounts[1]?.id ?? null);
  const [investmentId, setInvestmentId] = useState<string | null>(investments[0]?.id ?? null);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredCategories = useMemo(
    () => categories.filter((c) => c.type === (kind === "INCOME" ? "INCOME" : "EXPENSE")),
    [categories, kind],
  );

  const amount = useMemo(() => {
    const n = Number(amountStr.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }, [amountStr]);

  const onKey = useCallback((val: string) => {
    setAmountStr((prev) => {
      if (val === ".") {
        if (prev.includes(".")) return prev;
        return prev + ".";
      }
      if (val === "back") {
        return prev.length > 1 ? prev.slice(0, -1) : "0";
      }
      if (prev === "0") return val;
      if (prev.length >= 10) return prev;
      return prev + val;
    });
  }, []);

  const submit = useCallback(
    async (addAnother: boolean) => {
      if (amount <= 0) {
        setError("Ingresá un importe mayor a 0.");
        return;
      }
      if (!accountId) {
        setError("Seleccioná una cuenta.");
        return;
      }
      if (kind === "TRANSFER" && !destAccountId) {
        setError("Seleccioná cuenta destino.");
        return;
      }
      if (kind === "TRANSFER" && destAccountId === accountId) {
        setError("La cuenta destino debe ser distinta.");
        return;
      }

      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: kind,
            amount,
            currency,
            accountId,
            destinationAccountId: kind === "TRANSFER" ? destAccountId : null,
            categoryId:
              kind === "EXPENSE" || kind === "INCOME" ? categoryId : null,
            investmentId: kind === "INVESTMENT" ? investmentId : null,
            description:
              kind === "INVESTMENT"
                ? investments.find((i) => i.id === investmentId)?.name ?? "Inversión"
                : note || TYPE_LABEL[kind],
            notes: note,
            date: date.toISOString(),
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Error al guardar");
        }
        if (addAnother) {
          setAmountStr("0");
          setNote("");
          setDate(new Date());
          router.refresh();
        } else {
          router.push("/movimientos");
          router.refresh();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
      } finally {
        setSubmitting(false);
      }
    },
    [amount, accountId, destAccountId, kind, currency, categoryId, investmentId, note, date, investments, router],
  );

  return (
    <div className="flex flex-col w-full pb-6 text-on-surface gap-space-md">
      {/* Header back */}
      <div className="flex items-center justify-between -mt-2 -mx-margin-mobile px-margin-mobile pt-2">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 -ml-2 flex items-center justify-center rounded-full text-on-surface hover:text-primary transition-colors"
          aria-label="Volver"
        >
          <span className="material-symbols-outlined text-[24px]">arrow_back_ios_new</span>
        </button>
        <h1 className="font-headline-sm text-headline-sm font-semibold tracking-tight">
          Nuevo Movimiento
        </h1>
        <div className="w-10" />
      </div>

      {/* Type segmented control */}
      <div className="bg-surface-container-lowest p-1 rounded-xl flex items-center gap-1 overflow-x-auto no-scrollbar">
        {(Object.keys(TYPE_LABEL) as TxKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cn(
              "flex-1 min-w-[76px] py-2 px-2.5 rounded-lg font-label-md text-label-md text-center transition-all flex items-center justify-center gap-1",
              kind === k
                ? "bg-primary-container text-on-primary-container font-semibold shadow-sm"
                : "text-on-surface-variant hover:text-on-surface",
            )}
          >
            <span className="material-symbols-outlined text-[16px]">
              {TYPE_ICON[k]}
            </span>
            <span>{TYPE_LABEL[k]}</span>
          </button>
        ))}
      </div>

      {/* Amount display */}
      <div className="bg-surface-container-lowest rounded-2xl py-5 px-4 flex flex-col items-center justify-center relative overflow-hidden">
        <div className="flex items-center gap-2 mb-2">
          <button
            type="button"
            onClick={() =>
              setCurrency((c) => (c === "ARS" ? "USD" : "ARS"))
            }
            className="px-2.5 py-1 bg-surface-container-high rounded-full flex items-center gap-1 text-primary font-label-sm text-label-sm tracking-wider uppercase font-semibold active:scale-95 transition-transform"
          >
            <span>{currency}</span>
            <span className="material-symbols-outlined text-[14px]">swap_horiz</span>
          </button>
          <span className="text-on-surface-variant font-body-sm text-body-sm">
            Sin comisiones
          </span>
        </div>
        <div className="flex items-baseline justify-center tracking-tight text-on-surface tabular-nums">
          <span className="font-numeric-hero-mobile text-numeric-hero-mobile font-normal text-on-surface-variant mr-1">
            {currency === "USD" ? "US$" : "$"}
          </span>
          <span className="font-numeric-hero-mobile text-numeric-hero-mobile font-semibold">
            {amountStr || "0"}
          </span>
          <span className="inline-block w-[3px] h-7 bg-primary rounded-full ml-1 animate-pulse" />
        </div>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-1.5 flex items-center gap-1">
          <span className="material-symbols-outlined text-[14px] text-primary">
            pie_chart
          </span>
          {kind === "EXPENSE" && amount > 0
            ? `${((amount / Math.max(accounts.find((a) => a.id === accountId)?.currentBalance ?? 1, 1)) * 100).toFixed(1)}% del balance de la cuenta`
            : "Toca el keypad para ingresar el monto"}
        </p>
      </div>

      {/* Category chips */}
      {kind !== "INVESTMENT" && kind !== "TRANSFER" ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
              Categorías
            </span>
            <button className="font-label-sm text-label-sm text-primary flex items-center gap-0.5">
              <span>Editar</span>
              <span className="material-symbols-outlined text-[13px]">tune</span>
            </button>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            {filteredCategories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(c.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-xl font-label-md text-label-md font-medium shrink-0 active:scale-95 transition-all",
                  categoryId === c.id
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container-high text-on-surface-variant",
                )}
              >
                <span className="material-symbols-outlined text-[18px]">
                  {c.icon ?? "category"}
                </span>
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Account / payment details */}
      <div className="grid grid-cols-2 gap-2 bg-surface-container-lowest p-2 rounded-2xl">
        <SelectableField
          icon="account_balance"
          label="Cuenta origen"
          value={
            accounts.find((a) => a.id === accountId)?.name ?? "Seleccionar"
          }
          sub={`$ ${(accounts.find((a) => a.id === accountId)?.currentBalance ?? 0).toLocaleString("es-AR")}`}
          onClick={() =>
            setAccountId((curr) => cycleAccount(curr, accounts))
          }
        />

        {kind === "TRANSFER" ? (
          <SelectableField
            icon="arrow_forward"
            label="Cuenta destino"
            value={
              accounts.find((a) => a.id === destAccountId)?.name ?? "Seleccionar"
            }
            sub={
              accounts.find((a) => a.id === destAccountId)?.currency ?? ""
            }
            onClick={() =>
              setDestAccountId((curr) =>
                cycleAccount(curr, accounts, (a) => a.id !== accountId),
              )
            }
          />
        ) : (
          <SelectableField
            icon="credit_card"
            label="Método de pago"
            value={
              accounts.find((a) => a.id === accountId)?.type === "CREDIT_CARD"
                ? "Tarjeta Crédito"
                : "Débito / Transferencia"
            }
            sub={`• ${
              accounts.find((a) => a.id === accountId)?.name?.slice(0, 14) ??
              ""
            }`}
          />
        )}

        {kind === "INVESTMENT" ? (
          <SelectableField
            icon="query_stats"
            label="Activo"
            value={
              investments.find((i) => i.id === investmentId)?.name ?? "Seleccionar"
            }
            sub={
              investments.find((i) => i.id === investmentId)?.ticker ?? ""
            }
            onClick={() =>
              setInvestmentId((curr) => {
                if (!investments.length) return curr;
                const idx = investments.findIndex((i) => i.id === curr);
                return investments[(idx + 1) % investments.length]!.id;
              })
            }
          />
        ) : (
          <SelectableField
            icon="calendar_today"
            label="Fecha"
            value={format(date, "d MMM, HH:mm", { locale: es })}
          />
        )}

        <SelectableField
          icon="edit_note"
          label="Nota rápida"
          input
          value={note}
          onChange={(v) => setNote(v)}
          placeholder="Ej: Almuerzo equipo"
        />
      </div>

      {error ? (
        <div className="text-error font-body-sm text-body-sm bg-error-container/30 p-2 rounded-lg">
          {error}
        </div>
      ) : null}

      {/* Keypad */}
      <div className="bg-surface-container-lowest p-2 rounded-2xl grid grid-cols-3 gap-1.5 select-none touch-manipulation">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((v) => (
          <KeypadBtn key={v} value={v} onClick={() => onKey(v)} />
        ))}
        <KeypadBtn value="." onClick={() => onKey(".")} />
        <KeypadBtn value="0" onClick={() => onKey("0")} />
        <button
          type="button"
          onClick={() => onKey("back")}
          className="h-12 rounded-xl bg-surface-container flex items-center justify-center text-on-surface active:bg-surface-variant active:scale-95 transition-transform"
          aria-label="Borrar dígito"
        >
          <span className="material-symbols-outlined text-[20px]">backspace</span>
        </button>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 pt-1">
        <button
          type="button"
          disabled={submitting}
          onClick={() => submit(false)}
          className="w-full h-12 rounded-xl bg-primary text-on-primary font-headline-sm text-headline-sm font-semibold flex items-center justify-center gap-2 shadow-glow-primary-soft active:scale-[0.98] transition-all disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[20px]">check_circle</span>
          <span>{submitting ? "Guardando…" : `Guardar ${TYPE_LABEL[kind].toLowerCase()}`}</span>
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={() => submit(true)}
          className="w-full h-10 rounded-xl bg-surface-container-high text-on-surface-variant font-label-md text-label-md font-medium flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all hover:text-on-surface disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[16px]">add_circle</span>
          <span>Guardar y agregar otro</span>
        </button>
      </div>
    </div>
  );
}

function KeypadBtn({ value, onClick }: { value: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-12 rounded-xl bg-surface-container flex items-center justify-center font-numeric-card text-numeric-card text-on-surface active:bg-surface-variant active:scale-95 transition-transform"
    >
      {value}
    </button>
  );
}

function SelectableField({
  icon,
  label,
  value,
  sub,
  input,
  onChange,
  placeholder,
  onClick,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  input?: boolean;
  onChange?: (v: string) => void;
  placeholder?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className="flex flex-col gap-1 p-2 rounded-xl bg-surface-container-low active:bg-surface-container-high transition-colors"
      onClick={onClick}
    >
      <span className="font-label-sm text-label-sm text-on-surface-variant flex items-center gap-1">
        <span className="material-symbols-outlined text-[14px]">{icon}</span>
        {label}
      </span>
      <div className="flex items-center justify-between min-w-0">
        {input ? (
          <input
            className="bg-transparent font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/60 focus:outline-none w-full"
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <>
            <div className="min-w-0 pr-1">
              <p className="font-body-md text-body-md font-semibold text-on-surface truncate">
                {value}
              </p>
              {sub ? (
                <p
                  className={cn(
                    "font-body-sm text-body-sm",
                    sub.startsWith("•")
                      ? "text-primary truncate"
                      : "text-on-surface-variant truncate",
                  )}
                >
                  {sub}
                </p>
              ) : null}
            </div>
            <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
              expand_more
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function cycleAccount(
  current: string | null,
  list: Account[],
  predicate: (a: Account) => boolean = () => true,
): string {
  if (!list.length) return "";
  const candidates = list.filter(predicate);
  if (!candidates.length) return list[0]!.id;
  const idx = candidates.findIndex((a) => a.id === current);
  return candidates[(idx + 1) % candidates.length]!.id;
}