"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface Event {
  id: string;
  entityType: string;
  entityId: string;
  operation: string;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  processedAt: string | null;
}

interface Data {
  vaultPath: string | null;
  workerEnabled: boolean;
  lastVaultSync: string | null;
  lastVaultError: string | null;
  pendingCount: number;
  failedCount: number;
  totalSynced: number;
  vaultStat: { totalFiles: number; sizeBytes: number } | null;
  events: Event[];
}

function fmtBytes(b: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = b;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(1)} ${units[i]}`;
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `hace ${Math.floor(diff / 1000)}s`;
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)}h`;
  return `hace ${Math.floor(diff / 86_400_000)}d`;
}

export function SyncClient({ data }: { data: Data }) {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const syncNow = async () => {
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sync/run", { method: "POST" });
      const json = await res.json();
      if (json.ok) {
        setMessage(`✓ Procesados: ${json.processed} · Fallidos: ${json.failed}`);
        window.location.reload();
      } else {
        setMessage(`✗ Error: ${json.error ?? "desconocido"}`);
      }
    } catch (e) {
      setMessage(`✗ Error: ${e}`);
    } finally {
      setRunning(false);
    }
  };

  const verifyIntegrity = async () => {
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sync/verify", { method: "POST" });
      const json = await res.json();
      if (json.ok) {
        setMessage(`✓ ${json.summary}`);
        window.location.reload();
      } else {
        setMessage(`✗ Diferencias: ${json.summary}`);
      }
    } catch (e) {
      setMessage(`✗ Error: ${e}`);
    } finally {
      setRunning(false);
    }
  };

  const rebuild = async () => {
    if (!confirm("Esto REGENERARÁ todos los archivos del Vault. ¿Continuar?")) return;
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sync/rebuild", { method: "POST" });
      const json = await res.json();
      if (json.ok) {
        setMessage(`✓ Regenerados: ${json.regenerated} archivos`);
        window.location.reload();
      } else {
        setMessage(`✗ Error: ${json.error ?? "desconocido"}`);
      }
    } catch (e) {
      setMessage(`✗ Error: ${e}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 text-on-surface">
      <header className="pt-1">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-semibold tracking-tight">
          Sincronización Obsidian
        </h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
          DB → Vault mirror (transactional outbox)
        </p>
      </header>

      {/* Vault */}
      <section className="flex flex-col gap-2 p-4 rounded-xl bg-surface-container-low">
        <h2 className="font-label-md text-label-md font-semibold text-on-surface-variant uppercase tracking-wider">
          Vault
        </h2>
        <Row label="Path" value={data.vaultPath ?? "(no configurado)"} status={data.vaultPath ? "info" : "warn"} />
        {data.vaultStat ? (
          <>
            <Row
              label="Archivos"
              value={data.vaultStat.totalFiles.toString()}
              status="info"
            />
            <Row
              label="Tamaño"
              value={fmtBytes(data.vaultStat.sizeBytes)}
              status="info"
            />
          </>
        ) : null}
        <Row
          label="Última sync"
          value={fmtRelative(data.lastVaultSync)}
          status={data.lastVaultSync ? "ok" : "warn"}
        />
        {data.lastVaultError ? (
          <Row label="Último error" value={data.lastVaultError.slice(0, 60)} status="error" />
        ) : null}
      </section>

      {/* Outbox */}
      <section className="flex flex-col gap-2 p-4 rounded-xl bg-surface-container-low">
        <h2 className="font-label-md text-label-md font-semibold text-on-surface-variant uppercase tracking-wider">
          Outbox
        </h2>
        <Row
          label="Pendientes"
          value={data.pendingCount.toString()}
          status={data.pendingCount === 0 ? "ok" : "warn"}
        />
        <Row
          label="Fallidos"
          value={data.failedCount.toString()}
          status={data.failedCount === 0 ? "ok" : "error"}
        />
        <Row label="Total sincronizados" value={data.totalSynced.toString()} status="info" />
      </section>

      {/* Actions */}
      <section className="flex flex-col gap-2">
        <ActionButton onClick={syncNow} disabled={running}>
          Sincronizar ahora
        </ActionButton>
        <ActionButton onClick={verifyIntegrity} disabled={running}>
          Verificar integridad
        </ActionButton>
        <ActionButton onClick={rebuild} disabled={running} variant="danger">
          Regenerar Vault completo
        </ActionButton>
        {message ? (
          <p
            className={cn(
              "font-body-sm text-body-sm p-3 rounded-lg",
              message.startsWith("✓")
                ? "bg-primary-container/30 text-primary"
                : "bg-error-container/30 text-error",
            )}
          >
            {message}
          </p>
        ) : null}
      </section>

      {/* Recent events */}
      <section className="flex flex-col gap-2 p-4 rounded-xl bg-surface-container-low">
        <h2 className="font-label-md text-label-md font-semibold text-on-surface-variant uppercase tracking-wider">
          Eventos recientes
        </h2>
        {data.events.length === 0 ? (
          <p className="text-on-surface-variant font-body-sm">Sin eventos.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {data.events.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between gap-2 py-1.5 border-b border-surface-container last:border-b-0 text-body-sm"
              >
                <span className="flex items-center gap-2 font-body-sm text-on-surface">
                  <span
                    className={cn(
                      "px-1.5 py-0.5 rounded text-label-sm font-label-sm uppercase",
                      e.operation === "CREATE"
                        ? "bg-primary/20 text-primary"
                        : e.operation === "UPDATE"
                          ? "bg-secondary/20 text-secondary"
                          : "bg-error/20 text-error",
                    )}
                  >
                    {e.operation}
                  </span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant">
                    {e.entityType}
                  </span>
                </span>
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded text-label-sm font-label-sm uppercase",
                    e.status === "COMPLETED"
                      ? "bg-primary/20 text-primary"
                      : e.status === "PENDING"
                        ? "bg-secondary/20 text-secondary"
                        : e.status === "PROCESSING"
                          ? "bg-tertiary/20 text-tertiary"
                          : "bg-error/20 text-error",
                  )}
                >
                  {e.status}
                </span>
                {e.lastError ? (
                  <span className="font-label-sm text-label-sm text-error truncate max-w-[40%]">
                    {e.lastError.slice(0, 40)}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Row({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: "ok" | "error" | "warn" | "info";
}) {
  const dot =
    status === "ok"
      ? "bg-primary"
      : status === "error"
        ? "bg-error"
        : status === "warn"
          ? "bg-secondary"
          : "bg-outline";
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-surface-container last:border-b-0">
      <span className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-2">
        <span className={cn("w-2 h-2 rounded-full", dot)} />
        {label}
      </span>
      <span className="font-body-sm text-body-sm text-on-surface font-medium text-right truncate max-w-[60%]">
        {value}
      </span>
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  children,
  variant = "primary",
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: "primary" | "danger";
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-11 rounded-xl font-label-md font-semibold transition-all active:scale-[0.98] disabled:opacity-50",
        variant === "primary"
          ? "bg-primary-container text-on-primary-container"
          : "bg-error-container text-error",
      )}
    >
      {children}
    </button>
  );
}