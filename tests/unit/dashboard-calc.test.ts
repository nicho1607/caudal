import { describe, expect, it } from "vitest";

import {
  addMonths,
  balanceSeries,
  budgetPace,
  bucketCashflow,
  cashflowStartMonth,
  monthContext,
  pendingOccurrences,
  projectMonthEnd,
  rollingSumSeries,
  savingsRate,
  todayInTimeZone,
  type RecurringSchedule,
} from "@/server/services/dashboard.calc";

describe("dates", () => {
  it("adds months across years", () => {
    expect(addMonths("2026-10", 3)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });

  it("resolves today in the user's time zone", () => {
    const now = new Date("2026-10-28T23:30:00Z");
    expect(todayInTimeZone("Europe/Madrid", now)).toBe("2026-10-29");
    expect(todayInTimeZone("America/Bogota", now)).toBe("2026-10-28");
  });

  it("builds month context for current, past and future months", () => {
    expect(monthContext("2026-10", "2026-10-28")).toMatchObject({
      refDate: "2026-10-28",
      daysInMonth: 31,
      daysElapsed: 28,
      daysRemaining: 3,
      isCurrent: true,
      isPast: false,
    });
    expect(monthContext("2026-02", "2026-10-28")).toMatchObject({
      refDate: "2026-02-28",
      daysElapsed: 28,
      daysRemaining: 0,
      isPast: true,
    });
    expect(monthContext("2026-12", "2026-10-28")).toMatchObject({
      refDate: "2026-11-30",
      daysElapsed: 0,
      daysRemaining: 31,
      isCurrent: false,
      isPast: false,
    });
  });
});

describe("savingsRate", () => {
  it("is (income − expense) / income", () => {
    expect(savingsRate(4000, 3000)).toBeCloseTo(0.25);
  });
  it("can be negative", () => {
    expect(savingsRate(1000, 1500)).toBeCloseTo(-0.5);
  });
  it("is 0 without income", () => {
    expect(savingsRate(0, 300)).toBe(0);
  });
});

describe("budgetPace", () => {
  it("is daysElapsed / daysInPeriod clamped to 0..1", () => {
    expect(budgetPace(14, 30)).toBeCloseTo(0.4667, 3);
    expect(budgetPace(40, 30)).toBe(1);
    expect(budgetPace(-1, 30)).toBe(0);
    expect(budgetPace(3, 0)).toBe(0);
  });
});

describe("projectMonthEnd", () => {
  it("adds pending recurring and the variable daily average for the remaining days", () => {
    expect(
      projectMonthEnd({
        actualIncome: 2000,
        actualExpense: 1200,
        pendingRecurringIncome: 500,
        pendingRecurringExpense: 100,
        variableDailyAverage: 20,
        daysRemaining: 10,
      }),
    ).toEqual({ income: 2500, expense: 1500, net: 1000 });
  });

  it("equals actuals when the month is over", () => {
    expect(
      projectMonthEnd({
        actualIncome: 2000,
        actualExpense: 1200,
        pendingRecurringIncome: 0,
        pendingRecurringExpense: 0,
        variableDailyAverage: 20,
        daysRemaining: 0,
      }),
    ).toEqual({ income: 2000, expense: 1200, net: 800 });
  });
});

describe("pendingOccurrences", () => {
  const monthly: RecurringSchedule = {
    frequency: "MONTHLY",
    interval: 1,
    dayOfMonth: 31,
    startDate: "2026-01-31",
    endDate: null,
    nextRunAt: "2026-10-31",
  };

  it("lists occurrences from nextRunAt inside the range, clamping the day", () => {
    expect(pendingOccurrences(monthly, "2026-10-01", "2026-10-31")).toEqual(["2026-10-31"]);
    expect(pendingOccurrences(monthly, "2026-11-01", "2026-11-30")).toEqual(["2026-11-30"]);
  });

  it("ignores occurrences already materialized (before nextRunAt) and after endDate", () => {
    const rule = { ...monthly, dayOfMonth: 1, nextRunAt: "2026-11-01", endDate: "2026-12-15" };
    expect(pendingOccurrences(rule, "2026-10-01", "2026-10-31")).toEqual([]);
    expect(pendingOccurrences(rule, "2026-11-01", "2027-02-28")).toEqual(["2026-11-01", "2026-12-01"]);
  });

  it("handles weekly rules", () => {
    const weekly: RecurringSchedule = { ...monthly, frequency: "WEEKLY", dayOfMonth: null, nextRunAt: "2026-10-05" };
    expect(pendingOccurrences(weekly, "2026-10-01", "2026-10-31")).toEqual([
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
    ]);
  });
});

describe("bucketCashflow", () => {
  const months = [
    { month: "2025-12", income: 100, expense: 50 },
    { month: "2026-01", income: 200, expense: 80 },
    { month: "2026-02", income: 200, expense: 120 },
    { month: "2026-04", income: 300, expense: 100 },
    { month: "2026-05", income: 999, expense: 999 }, // posterior al mes final
  ];

  it("monthly: last 6 months ending at the selected month, zero-filled", () => {
    const buckets = bucketCashflow(months, "monthly", "2026-04");
    expect(buckets.map((b) => b.label)).toEqual(["Nov", "Dic", "Ene", "Feb", "Mar", "Abr"]);
    expect(buckets[0]).toEqual({ label: "Nov", income: 0, expense: 0, net: 0 });
    expect(buckets[5]).toEqual({ label: "Abr", income: 300, expense: 100, net: 200 });
  });

  it("quarterly: calendar quarters ending at the selected month's quarter", () => {
    const buckets = bucketCashflow(months, "quarterly", "2026-04");
    expect(buckets.map((b) => b.label)).toEqual(["T3 2025", "T4 2025", "T1 2026", "T2 2026"]);
    expect(buckets[1]).toMatchObject({ income: 100, expense: 50, net: 50 });
    expect(buckets[2]).toMatchObject({ income: 400, expense: 200, net: 200 });
    expect(buckets[3]).toMatchObject({ income: 300, expense: 100 });
  });

  it("yearly: last 3 calendar years", () => {
    const buckets = bucketCashflow(months, "yearly", "2026-04");
    expect(buckets.map((b) => b.label)).toEqual(["2024", "2025", "2026"]);
    expect(buckets[1]).toMatchObject({ income: 100, expense: 50, net: 50 });
    expect(buckets[2]).toMatchObject({ income: 700, expense: 300, net: 400 });
  });

  it("knows the earliest month any range needs", () => {
    expect(cashflowStartMonth("2026-04")).toBe("2024-01");
  });
});

describe("sparklines", () => {
  it("rolling sum over a trailing window", () => {
    const daily = new Map([
      ["2026-10-01", 10],
      ["2026-10-03", 5],
    ]);
    const series = rollingSumSeries(daily, "2026-10-04", 4, 2);
    expect(series).toEqual([
      { date: "2026-10-01", value: 10 },
      { date: "2026-10-02", value: 10 },
      { date: "2026-10-03", value: 5 },
      { date: "2026-10-04", value: 5 },
    ]);
  });

  it("30 points by default", () => {
    expect(rollingSumSeries(new Map(), "2026-10-28")).toHaveLength(30);
  });

  it("running balance from an opening value", () => {
    const daily = new Map([["2026-10-02", -25.5]]);
    expect(balanceSeries(100, daily, "2026-10-03", 3).map((p) => p.value)).toEqual([100, 74.5, 74.5]);
  });
});
