import { describe, it, expect } from "vitest";
import {
  calcMonthlyTotals,
  calcNetWorth,
  calcPositionPL,
  calcTransferSplit,
  calcSubscriptionMonthlyCost,
  calcSubscriptionAnnualCost,
  calcBudgetProgress,
  convertAmount,
  resolveRate,
  formatMoney,
  formatPercent,
} from "@/lib/finance";

describe("finance.calcMonthlyTotals", () => {
  const now = new Date(2024, 9, 15); // 15 de octubre
  const mk = (type: any, amount: number, date: Date) => ({
    type,
    amount,
    currency: "ARS",
    date,
  });

  it("calcula ingresos, gastos y balance del mes actual", () => {
    const txs = [
      mk("INCOME", 100000, new Date(2024, 9, 5)),
      mk("INCOME", 50000, new Date(2024, 9, 20)),
      mk("EXPENSE", 30000, new Date(2024, 9, 10)),
      mk("EXPENSE", 20000, new Date(2024, 9, 12)),
    ];
    const totals = calcMonthlyTotals(txs, 9, 2024);
    expect(totals.income).toBe(150000);
    expect(totals.expenses).toBe(50000);
    expect(totals.balance).toBe(100000);
  });

  it("ignora transferencias en el cash flow", () => {
    const txs = [
      mk("INCOME", 100000, new Date(2024, 9, 5)),
      mk("EXPENSE", 30000, new Date(2024, 9, 10)),
      mk("TRANSFER", 50000, new Date(2024, 9, 11)),
    ];
    const totals = calcMonthlyTotals(txs, 9, 2024);
    expect(totals.income).toBe(100000);
    expect(totals.expenses).toBe(30000);
    expect(totals.balance).toBe(70000);
  });

  it("cuenta inversiones como gasto de capital", () => {
    const txs = [
      mk("INCOME", 100000, new Date(2024, 9, 5)),
      mk("INVESTMENT", 25000, new Date(2024, 9, 15)),
    ];
    const totals = calcMonthlyTotals(txs, 9, 2024);
    expect(totals.expenses).toBe(25000);
  });

  it("calcula savingsRate correctamente", () => {
    const txs = [
      mk("INCOME", 100000, new Date(2024, 9, 5)),
      mk("EXPENSE", 60000, new Date(2024, 9, 10)),
    ];
    const totals = calcMonthlyTotals(txs, 9, 2024);
    expect(totals.savingsRate).toBe(0.4);
  });

  it("devuelve savingsRate 0 cuando no hay ingresos", () => {
    const txs = [mk("EXPENSE", 1000, new Date(2024, 9, 10))];
    const totals = calcMonthlyTotals(txs, 9, 2024);
    expect(totals.savingsRate).toBe(0);
  });

  it("filtra por mes/año correctamente", () => {
    const txs = [
      mk("INCOME", 100000, new Date(2024, 9, 5)),
      mk("INCOME", 50000, new Date(2024, 8, 30)),
    ];
    const totals = calcMonthlyTotals(txs, 9, 2024);
    expect(totals.income).toBe(100000);
  });
});

describe("finance.calcNetWorth", () => {
  const rates = [
    { from: "USD", to: "ARS", rate: 1000 },
    { from: "ARS", to: "USD", rate: 0.001 },
  ];

  it("Assets - Liabilities con conversión de monedas", () => {
    const accounts = [
      { currency: "ARS", currentBalance: 1_000_000 },
      { currency: "USD", currentBalance: 1000 },
    ];
    const investments = [
      { currency: "USD", quantity: 1, currentPrice: 50000 },
    ];
    const debts = [
      { currency: "ARS", remainingAmount: 200_000, status: "ACTIVE" },
    ];
    const nw = calcNetWorth(accounts, investments, debts, "ARS", rates);
    // 1M ARS + (1000 USD * 1000) + (1 * 50000 USD * 1000) - 200000
    expect(nw.totalAssets).toBe(1_000_000 + 1_000_000 + 50_000_000);
    expect(nw.totalLiabilities).toBe(200_000);
    expect(nw.netWorth).toBe(1_000_000 + 1_000_000 + 50_000_000 - 200_000);
    expect(nw.currency).toBe("ARS");
  });

  it("ignora deudas no activas", () => {
    const accounts = [{ currency: "ARS", currentBalance: 1000 }];
    const debts = [
      { currency: "ARS", remainingAmount: 5000, status: "PAID" },
      { currency: "ARS", remainingAmount: 9999, status: "CANCELLED" },
    ];
    const nw = calcNetWorth(accounts, [], debts, "ARS", rates);
    expect(nw.totalLiabilities).toBe(0);
    expect(nw.netWorth).toBe(1000);
  });
});

describe("finance.calcPositionPL", () => {
  it("ganancia positiva", () => {
    const pl = calcPositionPL({ quantity: 2, averagePurchasePrice: 100, currentPrice: 150 });
    expect(pl.investedCapital).toBe(200);
    expect(pl.currentValue).toBe(300);
    expect(pl.profitLoss).toBe(100);
    expect(pl.profitLossPct).toBe(0.5);
  });

  it("pérdida negativa", () => {
    const pl = calcPositionPL({ quantity: 1, averagePurchasePrice: 100, currentPrice: 70 });
    expect(pl.profitLoss).toBe(-30);
    expect(pl.profitLossPct).toBe(-0.3);
  });

  it("maneja quantity cero sin dividir por cero", () => {
    const pl = calcPositionPL({ quantity: 0, averagePurchasePrice: 100, currentPrice: 150 });
    expect(pl.profitLoss).toBe(0);
    expect(pl.profitLossPct).toBe(0);
  });
});

describe("finance.calcTransferSplit", () => {
  it("misma moneda: descuento y suma iguales", () => {
    const r = calcTransferSplit({
      amount: 1000,
      sourceCurrency: "ARS",
      destCurrency: "ARS",
    });
    expect(Number(r.amountDeducted)).toBe(1000);
    expect(Number(r.amountAdded)).toBe(1000);
  });

  it("monedas distintas con exchangeRate", () => {
    const r = calcTransferSplit({
      amount: 100,
      sourceCurrency: "USD",
      destCurrency: "ARS",
      exchangeRate: 1000,
    });
    expect(Number(r.amountDeducted)).toBe(100);
    expect(Number(r.amountAdded)).toBe(100_000);
  });
});

describe("finance.calcSubscriptionMonthlyCost", () => {
  it("mensual = directo", () => {
    expect(calcSubscriptionMonthlyCost(1000, "MONTHLY")).toBe(1000);
  });
  it("anual = /12", () => {
    expect(calcSubscriptionMonthlyCost(12000, "YEARLY")).toBeCloseTo(1000, 5);
  });
  it("trimestral = /3", () => {
    expect(calcSubscriptionMonthlyCost(3000, "QUARTERLY")).toBeCloseTo(1000, 5);
  });
  it("semanal * 52 / 12", () => {
    expect(calcSubscriptionMonthlyCost(100, "WEEKLY")).toBeCloseTo((100 * 52) / 12, 1);
  });
});

describe("finance.calcSubscriptionAnnualCost", () => {
  it("mensual * 12", () => {
    expect(calcSubscriptionAnnualCost(100, "MONTHLY")).toBeCloseTo(1200, 5);
  });
});

describe("finance.calcBudgetProgress", () => {
  it("spent dentro de límite", () => {
    const p = calcBudgetProgress(300, 1000);
    expect(p.spent).toBe(300);
    expect(p.limit).toBe(1000);
    expect(p.remaining).toBe(700);
    expect(p.percentage).toBe(0.3);
  });
  it("spent excedido → percentage clamped a 1", () => {
    const p = calcBudgetProgress(1500, 1000);
    expect(p.percentage).toBe(1);
    expect(p.remaining).toBe(0);
  });
  it("limit 0 → percentage 0", () => {
    const p = calcBudgetProgress(100, 0);
    expect(p.percentage).toBe(0);
  });
});

describe("finance.convertAmount + resolveRate", () => {
  it("misma moneda → no convierte", () => {
    expect(convertAmount(100, "ARS", "ARS", []).toNumber()).toBe(100);
  });
  it("usa tasa directa", () => {
    expect(
      convertAmount(100, "USD", "ARS", [{ from: "USD", to: "ARS", rate: 1000 }]).toNumber(),
    ).toBe(100_000);
  });
  it("usa tasa inversa si no hay directa", () => {
    expect(
      resolveRate([{ from: "ARS", to: "USD", rate: 0.001 }], "USD", "ARS").toNumber(),
    ).toBeCloseTo(1000, 5);
  });
});

describe("finance.formatMoney / formatPercent", () => {
  it("formato ARS con separadores", () => {
    const f = formatMoney(1_234_567, "ARS", { showSymbol: false });
    expect(f).toContain("1.234.567");
  });
  it("USD usa prefijo US$", () => {
    expect(formatMoney(100, "USD")).toContain("US$");
  });
  it("formatPercent devuelve porcentaje con 1 decimal", () => {
    expect(formatPercent(0.387)).toBe("38.7%");
  });
});