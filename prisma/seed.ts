/* eslint-disable no-console */
/**
 * FINORA — Seed para DESARROLLO LOCAL
 *
 * Crea un usuario demo con datos ficticios.
 * NUNCA debe ejecutarse en producción.
 *
 * En producción usar:  npm run init-prod   (pide email + password por consola)
 */
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_USER_EMAIL = "owner@finora.local";
const DEFAULT_USER_PASSWORD = "finora-demo-2024"; // DEV only

const DEFAULT_CATEGORIES_EXPENSE = [
  { name: "Comida", icon: "restaurant", color: "#68dba9" },
  { name: "Supermercado", icon: "shopping_cart", color: "#b7c8e1" },
  { name: "Transporte", icon: "directions_subway", color: "#7bd0ff" },
  { name: "Salidas", icon: "local_bar", color: "#85f8c4" },
  { name: "Café", icon: "coffee", color: "#ffb4ab" },
  { name: "Salud", icon: "medication", color: "#ffb4ab" },
  { name: "Suscripciones", icon: "subscriptions", color: "#7bd0ff" },
  { name: "Hogar", icon: "home", color: "#b7c8e1" },
  { name: "Compras", icon: "shopping_bag", color: "#68dba9" },
  { name: "Educación", icon: "school", color: "#7bd0ff" },
  { name: "Servicios", icon: "bolt", color: "#ffb4ab" },
  { name: "Otros", icon: "more_horiz", color: "#87948b" },
];

const DEFAULT_CATEGORIES_INCOME = [
  { name: "Trabajo", icon: "payments", color: "#68dba9" },
  { name: "Freelance", icon: "laptop_mac", color: "#85f8c4" },
  { name: "Inversiones", icon: "trending_up", color: "#7bd0ff" },
  { name: "Regalos", icon: "redeem", color: "#b7c8e1" },
  { name: "Otros", icon: "more_horiz", color: "#87948b" },
];

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error(
      "✗ ERROR: seed.ts NO debe correr en NODE_ENV=production.\n" +
        "  Usá `npm run init-prod` para crear tu usuario real.",
    );
    process.exit(1);
  }

  console.log("→ Seed DEV: empezando…");

  const passwordHash = await bcrypt.hash(DEFAULT_USER_PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email: DEFAULT_USER_EMAIL },
    update: { passwordHash },
    create: {
      email: DEFAULT_USER_EMAIL,
      passwordHash,
      name: "Alex",
      baseCurrency: "ARS",
    },
  });
  console.log(`✓ Usuario dev: ${user.email}`);

  await prisma.settings.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, baseCurrency: "ARS" },
  });

  await prisma.exchangeRate.create({
    data: {
      userId: user.id,
      from: "USD",
      to: "ARS",
      rate: new Prisma.Decimal(1450),
      source: "SEED",
    },
  });

  for (const c of DEFAULT_CATEGORIES_EXPENSE) {
    await prisma.category.upsert({
      where: {
        userId_name_type: { userId: user.id, name: c.name, type: "EXPENSE" },
      },
      update: {},
      create: {
        userId: user.id,
        name: c.name,
        type: "EXPENSE",
        icon: c.icon,
        color: c.color,
        isDefault: true,
      },
    });
  }
  for (const c of DEFAULT_CATEGORIES_INCOME) {
    await prisma.category.upsert({
      where: {
        userId_name_type: { userId: user.id, name: c.name, type: "INCOME" },
      },
      update: {},
      create: {
        userId: user.id,
        name: c.name,
        type: "INCOME",
        icon: c.icon,
        color: c.color,
        isDefault: true,
      },
    });
  }
  console.log("✓ Categorías creadas");

  const accountsData: Array<{
    name: string;
    type: string;
    currency: string;
    initialBalance: number;
    currentBalance: number;
    icon: string;
    color: string;
  }> = [
    { name: "Banco Galicia", type: "BANK", currency: "ARS", initialBalance: 1500000, currentBalance: 1420000, icon: "account_balance", color: "#68dba9" },
    { name: "Mercado Pago", type: "WALLET", currency: "ARS", initialBalance: 350000, currentBalance: 425000, icon: "account_balance_wallet", color: "#7bd0ff" },
    { name: "Tarjeta Visa", type: "CREDIT_CARD", currency: "ARS", initialBalance: 0, currentBalance: -95000, icon: "credit_card", color: "#b7c8e1" },
    { name: "Efectivo ARS", type: "CASH", currency: "ARS", initialBalance: 50000, currentBalance: 35000, icon: "payments", color: "#85f8c4" },
    { name: "Broker USD", type: "BROKER", currency: "USD", initialBalance: 1200, currentBalance: 1850, icon: "trending_up", color: "#7bd0ff" },
    { name: "Crypto Broker", type: "CRYPTO", currency: "USD", initialBalance: 500, currentBalance: 720, icon: "currency_bitcoin", color: "#ffb4ab" },
  ];

  const existing = await prisma.account.count({ where: { userId: user.id } });
  if (existing === 0) {
    for (const a of accountsData) {
      await prisma.account.create({
        data: {
          userId: user.id,
          name: a.name,
          type: a.type,
          currency: a.currency,
          initialBalance: new Prisma.Decimal(a.initialBalance),
          currentBalance: new Prisma.Decimal(a.currentBalance),
          icon: a.icon,
          color: a.color,
        },
      });
    }
    console.log("✓ Cuentas creadas");
  }

  const txCount = await prisma.transaction.count({ where: { userId: user.id } });
  if (txCount === 0) {
    const accounts = await prisma.account.findMany({ where: { userId: user.id } });
    const cats = await prisma.category.findMany({ where: { userId: user.id } });
    const findAcc = (name: string) => accounts.find((a) => a.name === name)!;
    const findCat = (name: string, type: string) =>
      cats.find((c) => c.name === name && c.type === type)!;
    const now = new Date();
    const sameDay = (offsetDays: number, hours: number, minutes = 0) => {
      const d = new Date(now);
      d.setDate(d.getDate() - offsetDays);
      d.setHours(hours, minutes, 0, 0);
      return d;
    };

    const txs = [
      { type: "EXPENSE", amount: 7500, currency: "ARS", date: sameDay(0, 11, 15), description: "Starbucks", accountId: findAcc("Mercado Pago").id, categoryId: findCat("Café", "EXPENSE").id },
      { type: "INCOME", amount: 25000, currency: "ARS", date: sameDay(0, 9, 30), description: "Transferencia recibida", accountId: findAcc("Banco Galicia").id, categoryId: findCat("Otros", "INCOME").id },
      { type: "EXPENSE", amount: 40000, currency: "ARS", date: sameDay(1, 18, 40), description: "Estación Shell", accountId: findAcc("Tarjeta Visa").id, categoryId: findCat("Transporte", "EXPENSE").id },
      { type: "EXPENSE", amount: 14200, currency: "ARS", date: sameDay(1, 14, 10), description: "Farmacity", accountId: findAcc("Efectivo ARS").id, categoryId: findCat("Salud", "EXPENSE").id },
      { type: "EXPENSE", amount: 9999, currency: "ARS", date: sameDay(2, 22, 0), description: "Netflix", accountId: findAcc("Tarjeta Visa").id, categoryId: findCat("Suscripciones", "EXPENSE").id },
      { type: "EXPENSE", amount: 86300, currency: "ARS", date: sameDay(2, 19, 30), description: "Supermercado Coto", accountId: findAcc("Banco Galicia").id, categoryId: findCat("Supermercado", "EXPENSE").id },
      { type: "INVESTMENT", amount: 100000, currency: "ARS", date: sameDay(4, 12, 0), description: "Compra Bitcoin BTC", accountId: findAcc("Crypto Broker").id, categoryId: findCat("Inversiones", "INCOME").id },
      { type: "INCOME", amount: 900000, currency: "ARS", date: sameDay(4, 9, 0), description: "Sueldo Quincenal", accountId: findAcc("Banco Galicia").id, categoryId: findCat("Trabajo", "INCOME").id },
    ];

    for (const tx of txs) {
      await prisma.transaction.create({
        data: {
          userId: user.id,
          type: tx.type,
          amount: new Prisma.Decimal(tx.amount),
          currency: tx.currency,
          accountId: tx.accountId,
          categoryId: tx.categoryId,
          description: tx.description,
          date: tx.date,
        },
      });
    }
    console.log(`✓ ${txs.length} transacciones demo`);
  }

  console.log("→ Seed DEV completo.");
  console.log(`   Email:    ${DEFAULT_USER_EMAIL}`);
  console.log(`   Password: ${DEFAULT_USER_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });