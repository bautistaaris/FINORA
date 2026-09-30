"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface Period {
  id: string;
  label: string;
  value: string;
}

const PERIODS: Period[] = [
  { id: "today", label: "Hoy", value: "today" },
  { id: "week", label: "Últimos 7 días", value: "week" },
  { id: "month", label: "Este mes", value: "month" },
  { id: "last-month", label: "Mes anterior", value: "last-month" },
  { id: "year", label: "Este año", value: "year" },
];

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function PeriodSelector({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const current = PERIODS.find((p) => p.value === value) ?? PERIODS[2]!;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 bg-surface-container-high hover:bg-surface-variant text-on-surface px-3 py-2 rounded-lg font-label-md text-label-md transition-all active:scale-95 shadow-sm"
      >
        <span className="material-symbols-outlined text-[18px] text-primary">
          calendar_month
        </span>
        <span className="font-medium">{current.label}</span>
        <span
          className={cn(
            "material-symbols-outlined text-[16px] text-on-surface-variant transition-transform",
            open && "rotate-180",
          )}
        >
          expand_more
        </span>
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
            aria-label="Cerrar selector"
          />
          <div className="absolute right-0 mt-2 w-48 bg-surface-container-highest rounded-xl p-1.5 shadow-xl z-50 flex flex-col gap-0.5">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={cn(
                  "flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-left font-body-sm text-body-sm transition-colors",
                  p.value === value
                    ? "bg-surface-container text-primary font-medium"
                    : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container",
                )}
                onClick={() => {
                  onChange(p.value);
                  setOpen(false);
                }}
              >
                <span>{p.label}</span>
                {p.value === value ? (
                  <span className="material-symbols-outlined text-[16px]">check</span>
                ) : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function periodToRange(value: string, now = new Date()): {
  start: Date;
  end: Date;
} {
  const start = new Date(now);
  const end = new Date(now);
  switch (value) {
    case "today":
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      d.setHours(0, 0, 0, 0);
      start.setTime(d.getTime());
      end.setHours(23, 59, 59, 999);
      break;
    }
    case "last-month": {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const e = new Date(
        now.getFullYear(),
        now.getMonth(),
        0,
        23,
        59,
        59,
        999,
      );
      start.setTime(s.getTime());
      end.setTime(e.getTime());
      break;
    }
    case "year": {
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(11, 31);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case "month":
    default: {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(now.getMonth() + 1, 0);
      end.setHours(23, 59, 59, 999);
      break;
    }
  }
  return { start, end };
}