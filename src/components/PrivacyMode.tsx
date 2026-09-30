"use client";

import { useEffect, useState } from "react";

interface PrivacyContextValue {
  masked: boolean;
  toggle: () => void;
  setMasked: (v: boolean) => void;
}

const KEY = "finora:privacy-mode";

export function usePrivacyMode(): PrivacyContextValue {
  const [masked, setMaskedState] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "1") setMaskedState(true);
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(KEY, masked ? "1" : "0");
    } catch {
      // ignore
    }
  }, [masked, hydrated]);

  return {
    masked,
    toggle: () => setMaskedState((v) => !v),
    setMasked: setMaskedState,
  };
}

export function MaskedValue({
  value,
  className,
  format,
}: {
  value: number | string;
  className?: string;
  format?: (v: number) => string;
}) {
  const { masked } = usePrivacyMode();
  const display = typeof value === "number" ? format?.(value) ?? String(value) : value;
  const placeholder = "$ ••••";
  return (
    <span className={className} aria-hidden={masked}>
      {masked ? placeholder : display}
    </span>
  );
}