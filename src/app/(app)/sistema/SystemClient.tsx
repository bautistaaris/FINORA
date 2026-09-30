"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

interface Data {
  serverNow: string;
  db: "ok" | "error";
  vault: "ok" | "missing";
  vaultPath: string | null;
  pendingCount: number;
  failedCount: number;
  totalSynced: number;
  lastEvent: {
    at: string;
    status: string;
    entityType: string;
  } | null;
  lastVaultSync: string | null;
  lastVaultError: string | null;
  workerEnabled: boolean;
  disk: { free: number | null; total: number | null };
}

function fmtBytes(b: number | null): string {
  if (b === null) return "—";
  const units = ["B, ", "KB", "MB", "GB", "TB"];
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
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  if (diff < 60_000) return `hace ${Math.floor(diff / 1000)}s`;
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `hace ${Math.floor(diff / 3_600_000)}h`;
  return `hace ${Math.floor(diff / 86_400_000)}d`;
}

export function SystemClient({ data }: { data: Data }) {
  const diskLow =
    data.disk.free !== null && data.disk.total !== null && data.disk.free / data.disk.total < 0.1;

  return (
    <div className="flex flex-col gap-4 text-on-surface">
      <header className="pt-1">
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-semibold tracking-tight">
          Sistema
        </h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
          Estado de la infraestructura
        </p>
      </header>

      {/* DB */}
      <Card title="Base de datos">
        <Row label="PostgreSQL" value={data.db === "ok" ? "Conectado" : "Error"} status={data.db === "ok" ? "ok" : "error"} />
        <Row label="Servidor" value={new Date(data.serverNow).toLocaleString("es-AR")} status="info" />
      </Card>

      {/* Vault */}
      <Card title="Obsidian Vault">
        <Row
          label="Vault"
          value={data.vault === "ok" ? "Conectado" : "No accesible"}
          status={data.vault === "ok" ? "ok" : "error"}
        />
        <Row label="Path" value={data.vaultPath ?? "(no configurado)"} status="info" />
      </Card>

      {/* Sync */}
      <Card title="Sincronización DB → Vault">
        <Row
          label="Worker"
          value={data.workerEnabled ? "Activo" : "Detenido"}
          status={data.workerEnabled ? "ok" : "warn"}
        />
        <Row
          label="Eventos pendientes"
          value={data.pendingCount.toString()}
          status={data.pendingCount === 0 ? "ok" : "warn"}
        />
        <Row
          label="Eventos fallidos"
          value={data.failedCount.toString()}
          status={data.failedCount === 0 ? "ok" : "error"}
        />
        <Row label="Total sincronizados" value={data.totalSynced.toString()} status="info" />
        <Row label="Última sync Vault" value={fmtRelative(data.lastVaultSync)} status="info" />
        {data.lastVaultError ? (
          <Row label="Último error" value={data.lastVaultError.slice(0, 60)} status="error" />
        ) : null}
        {data.lastEvent ? (
          <Row
            label="Último evento"
            value={`${data.lastEvent.entityType} · ${fmtRelative(data.lastEvent.at)}`}
            status="info"
          />
        ) : null}
      </Card>

      {/* Disk */}
      <Card title="Disco">
        <Row
          label="Libre / Total"
          value={`${fmtBytes(data.disk.free)} / ${fmtBytes(data.disk.total)}`}
          status={diskLow ? "warn" : "ok"}
        />
        {diskLow ? (
          <p className="text-label-sm text-label-sm text-error mt-2">
            ⚠ Menos del 10% de espacio libre. Considerá limpiar backups antiguos.
          </p>
        ) : null}
      </Card>

      {/* Actions */}
      <div className="flex flex-col gap-2 pt-2">
        <Link
          href="/mas/sync"
          className="h-11 rounded-xl bg-surface-container-high text-on-surface font-label-md font-semibold flex items-center justify-center"
        >
          Configurar sincronización
        </Link>
        <p className="text-label-sm text-label-sm text-on-surface-variant text-center mt-2">
          Diagnóstico interno. No muestra secretos ni montos.
        </p>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 p-4 rounded-xl bg-surface-container-low">
      <h2 className="font-label-md text-label-md font-semibold text-on-surface-variant uppercase tracking-wider">
        {title}
      </h2>
      {children}
    </section>
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