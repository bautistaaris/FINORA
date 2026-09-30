"use client";

import { usePrivacyMode } from "./PrivacyMode";

export function PrivacyToggle() {
  const { masked, toggle } = usePrivacyMode();
  return (
    <button
      type="button"
      aria-label={masked ? "Mostrar saldo" : "Ocultar saldo"}
      onClick={toggle}
      className="w-11 h-11 flex items-center justify-center rounded-full text-on-surface-variant hover:text-on-surface transition-colors"
    >
      <span className="material-symbols-outlined text-[22px]">
        {masked ? "visibility_off" : "visibility"}
      </span>
    </button>
  );
}