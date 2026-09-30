/* eslint-disable no-console */
/**
 * FINORA — Generate Obsidian aggregated reports (dashboard + monthly)
 *
 * Regenera:
 *   FINORA/00 Dashboard/FINORA Dashboard.md
 *   FINORA/09 Reports/Monthly/{YYYY-MM}.md  (último mes cerrado + mes actual)
 *
 * Uso:
 *   npm run obsidian:reports                    # dashboard + mes actual + último mes cerrado
 *   npm run obsidian:reports -- --year=2026 --month=9   # sólo un mes específico
 *
 * Variables de entorno:
 *   OBSIDIAN_VAULT_PATH  - requerida
 *   DATABASE_URL          - requerida
 */

import { generateDashboard, generateMonthlyReport } from "../src/lib/obsidian/reports";
import { prisma } from "../src/lib/db";

async function main() {
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH;
  if (!vaultPath) {
    console.error("✗ OBSIDIAN_VAULT_PATH no está configurado.");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const yearArg = args.find((a) => a.startsWith("--year="))?.split("=")[1];
  const monthArg = args.find((a) => a.startsWith("--month="))?.split("=")[1];

  const user = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    console.error("✗ No hay usuarios en la DB.");
    process.exit(1);
  }

  console.log(`→ Generando reports Obsidian`);
  console.log(`  Vault: ${vaultPath}`);
  console.log(`  User:  ${user.email}`);

  // Dashboard
  const dashResult = await generateDashboard(vaultPath, user.id);
  console.log(`✓ Dashboard: ${dashResult.path}`);
  console.log(`  bytes: ${dashResult.bytes}`);

  // Monthly reports
  if (yearArg && monthArg) {
    const y = Number(yearArg);
    const m = Number(monthArg);
    const monthResult = await generateMonthlyReport(vaultPath, user.id, m, y);
    console.log(`✓ Monthly ${y}-${m.toString().padStart(2, "0")}: ${monthResult.path}`);
  } else {
    // Mes actual + último mes cerrado
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const currentResult = await generateMonthlyReport(
      vaultPath,
      user.id,
      currentMonth,
      currentYear,
    );
    console.log(
      `✓ Monthly ${currentYear}-${currentMonth.toString().padStart(2, "0")}: ${currentResult.path}`,
    );

    // Si estamos día 1+, generar también el mes anterior
    if (now.getDate() >= 1) {
      const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      const lastYear = currentMonth === 1 ? currentYear - 1 : currentYear;
      const lastResult = await generateMonthlyReport(
        vaultPath,
        user.id,
        lastMonth,
        lastYear,
      );
      console.log(
        `✓ Monthly ${lastYear}-${lastMonth.toString().padStart(2, "0")}: ${lastResult.path}`,
      );
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});