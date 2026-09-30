import { Logo } from "./Logo";

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center text-outline mb-3">
        <span className="material-symbols-outlined text-[32px]">{icon}</span>
      </div>
      <span className="font-headline-sm text-headline-sm font-semibold text-on-surface">
        {title}
      </span>
      {description ? (
        <p className="font-body-sm text-body-sm text-on-surface-variant max-w-xs mt-1">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center text-on-surface-variant">
      <div className="flex items-center gap-2">
        <Logo size={20} />
        <span className="font-body-sm text-body-sm">{label}</span>
      </div>
    </div>
  );
}