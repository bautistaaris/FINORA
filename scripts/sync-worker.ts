/* eslint-disable no-console */
/**
 * FINORA — Sync Worker (proceso de fondo)
 *
 * Corre como proceso independiente (npm run sync:worker)
 * Procesa eventos del outbox y los traduce a archivos Markdown.
 *
 * Uso:
 *   npm run sync:worker        # infinito
 *   npm run sync:once          # procesa un lote y sale
 *
 * Requisitos:
 *   - OBSIDIAN_VAULT_PATH configurado
 *   - DATABASE_URL apuntando a Postgres
 *
 * Compatible con:
 *   - pm2, systemd, Windows Service (NSSM), Docker
 */

import { processBatch } from "../src/lib/sync/worker";

const VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH ?? "";
if (!VAULT_PATH) {
  console.error("✗ OBSIDIAN_VAULT_PATH no está configurado.");
  process.exit(1);
}

const INTERVAL_MS = Number(process.env.SYNC_INTERVAL_MS ?? 5000);
const BATCH_SIZE = Number(process.env.SYNC_BATCH_SIZE ?? 50);
const ONCE = process.argv.includes("--once");

console.log(`→ FINORA Sync Worker`);
console.log(`  Vault:    ${VAULT_PATH}`);
console.log(`  Interval: ${INTERVAL_MS}ms`);
console.log(`  Batch:    ${BATCH_SIZE}`);
console.log(`  Mode:     ${ONCE ? "once" : "infinite loop"}`);

let running = true;
const stop = (sig: NodeJS.Signals | string) => {
  console.log(`\n${sig} recibido — saliendo...`);
  running = false;
};
process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

async function loop() {
  while (running) {
    try {
      const stats = await processBatch({
        vaultPath: VAULT_PATH,
        batchSize: BATCH_SIZE,
        verbose: false,
      });
      if (stats.processed > 0 || stats.failed > 0) {
        console.log(
          `[${new Date().toISOString()}] processed=${stats.processed} failed=${stats.failed} skipped=${stats.skipped}`,
        );
        for (const e of stats.errors) {
          console.log(`  ✗ ${e.id}: ${e.error}`);
        }
      }
    } catch (err) {
      console.error("Worker error:", err);
    }
    if (ONCE) {
      running = false;
    } else {
      await new Promise((r) => setTimeout(r, INTERVAL_MS));
    }
  }
}

loop()
  .then(() => {
    console.log("✓ Worker finalizado.");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });