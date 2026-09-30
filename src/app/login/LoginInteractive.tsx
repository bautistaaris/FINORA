"use client";

export function PasswordToggle() {
  return (
    <button
      aria-label="Mostrar u ocultar contraseña"
      className="absolute right-1 w-10 h-10 flex items-center justify-center text-outline hover:text-on-surface transition-colors active:scale-90"
      type="button"
      onClick={(e) => {
        const input = (e.currentTarget.parentElement?.querySelector(
          "input",
        ) as HTMLInputElement | null);
        if (!input) return;
        input.type = input.type === "password" ? "text" : "password";
        const icon = e.currentTarget.querySelector(".material-symbols-outlined");
        if (icon) icon.textContent = input.type === "password" ? "visibility_off" : "visibility";
      }}
    >
      <span className="material-symbols-outlined text-[20px]">visibility_off</span>
    </button>
  );
}

export function BiometricButton() {
  return (
    <button
      className="w-full h-12 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface flex items-center justify-center gap-2.5 transition-all active:scale-[0.98]"
      type="button"
      onClick={(e) => {
        const btn = e.currentTarget;
        const alert = document.getElementById("biometric-alert");
        if (!alert) return;
        alert.classList.remove("hidden");
        alert.classList.add("flex");
        alert.innerHTML = `
          <span class="material-symbols-outlined text-[18px] text-primary animate-pulse">fingerprint</span>
          <span class="font-body-sm text-body-sm text-on-surface">Escaneando credencial biométrica...</span>
        `;
        setTimeout(() => {
          alert.innerHTML = `
            <span class="material-symbols-outlined text-[18px] text-primary" style="font-variation-settings: 'FILL' 1;">check_circle</span>
            <span class="font-body-sm text-body-sm text-primary">Enclave verificado. Iniciando sesión...</span>
          `;
        }, 1200);
        void btn;
      }}
    >
      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary">
        <span className="material-symbols-outlined text-[18px]">fingerprint</span>
      </div>
      <span className="font-label-md text-label-md font-medium tracking-tight">
        Acceder con Face ID / Huella
      </span>
    </button>
  );
}