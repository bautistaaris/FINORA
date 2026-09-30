"use client";

import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/finance";
import { usePrivacyMode } from "@/components/PrivacyMode";

interface Props {
  value: number;
  currency: string;
  className?: string;
  showCurrency?: boolean;
  placeholder?: string;
}

export function PrivacyValue({
  value,
  currency,
  className,
  showCurrency = false,
  placeholder = "$ ••••••",
}: Props) {
  const { masked } = usePrivacyMode();
  const formatted = formatMoney(value, currency);
  return (
    <span className={cn("tabular-nums", className)}>
      {masked ? placeholder : formatted}
      {showCurrency ? (
        <span className="ml-1 text-on-surface-variant text-xs">{currency}</span>
      ) : null}
    </span>
  );
}