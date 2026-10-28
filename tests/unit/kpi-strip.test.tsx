import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { KpiStrip, KpiStripSkeleton } from "@/features/dashboard/components/kpi-strip";
import type { DashboardData, Kpi } from "@/features/dashboard/types";

afterEach(cleanup);

const spark = [1, 3, 2, 4].map((value, i) => ({ date: `2026-10-0${i + 1}`, value }));
const kpi = (value: number, previous: number): Kpi => ({ value, previous, sparkline: spark });

function makeData(): DashboardData {
  return {
    currency: "COP",
    locale: "es-CO",
    month: "2026-10",
    kpis: {
      totalBalance: kpi(16383481, 15558000),
      monthIncome: kpi(4500000, 4550000),
      monthExpense: kpi(3670200, 3500000), // sube el gasto → desfavorable
      netSavings: kpi(829800, 0), // sin base comparable
    },
    cashflow: { monthly: [], quarterly: [], yearly: [] },
    categories: [],
    health: {
      netCashflow: 829800,
      savingsRate: 0.184,
      fixedExpenses: 0,
      variableExpenses: 0,
      projectedMonthEnd: { income: 0, expense: 0, net: 0 },
      daysElapsed: 28,
      daysInMonth: 31,
    },
    budgets: [],
    recent: [],
  };
}

const norm = (s: string | null) => (s ?? "").replace(/\s/g, " ");

describe("KpiStrip", () => {
  it("renders one strip with four segments, balance first and larger", () => {
    render(<KpiStrip data={makeData()} />);
    const strip = screen.getByRole("region", { name: "Indicadores del mes" });
    expect(strip.children).toHaveLength(4);
    expect(strip.children[0].textContent).toContain("Saldo total");
    const hero = screen.getByText((_, el) => el?.tagName === "SPAN" && norm(el.textContent) === "$ 16.383.481");
    expect(hero.className).toContain("text-[32px]");
    expect(strip.querySelectorAll("svg")).toHaveLength(4);
  });

  it("colors deltas by favourability and handles a zero base", () => {
    render(<KpiStrip data={makeData()} />);
    const expenseDelta = screen.getByText((_, el) => el?.tagName === "SPAN" && /^\+4,9 ?%$/.test(norm(el.textContent)));
    expect(expenseDelta.className).toContain("text-expense");
    const incomeDelta = screen.getByText((_, el) => el?.tagName === "SPAN" && /^−1,1/.test(norm(el.textContent)));
    expect(incomeDelta.className).toContain("text-expense");
    expect(screen.getByText(/Sin datos de sept/)).toBeTruthy();
    expect(screen.getByText(/Tasa 18,4/)).toBeTruthy();
  });

  it("skeleton keeps the four-segment shape", () => {
    const { container } = render(<KpiStripSkeleton />);
    expect(container.firstElementChild?.children).toHaveLength(4);
  });
});
