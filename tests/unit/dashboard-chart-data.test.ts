import { describe, expect, it } from "vitest";

import {
  buildCashflowRows,
  groupCategorySlices,
  isCashflowEmpty,
  isProjectingMonth,
  OTHER_SLICE_ID,
} from "@/features/dashboard/chart-data";
import type { CashflowBucket, CategorySlice } from "@/features/dashboard/types";

const buckets: CashflowBucket[] = [
  { label: "Ago", income: 5000, expense: 3000, net: 2000 },
  { label: "Sep", income: 4500, expense: 3800, net: 700 },
  { label: "Oct", income: 4500, expense: 3600, net: 900 },
];
const projectedMonthEnd = { income: 4500, expense: 3850.5, net: 649.5 };
const current = { daysElapsed: 28, daysInMonth: 31, projectedMonthEnd };

describe("isProjectingMonth", () => {
  it("only while the month is in progress", () => {
    expect(isProjectingMonth({ daysElapsed: 28, daysInMonth: 31 })).toBe(true);
    expect(isProjectingMonth({ daysElapsed: 31, daysInMonth: 31 })).toBe(false); // pasado / último día
    expect(isProjectingMonth({ daysElapsed: 0, daysInMonth: 30 })).toBe(false); // futuro
  });
});

describe("buildCashflowRows", () => {
  it("adds the remaining projection on the current month bucket", () => {
    const rows = buildCashflowRows(buckets, "monthly", current);
    const oct = rows[2];
    expect(oct.projected).toBe(true);
    expect(oct.net).toBeNull();
    expect(oct.netToDate).toBe(900);
    expect(oct.incomeRemaining).toBe(0);
    expect(oct.expenseRemaining).toBeCloseTo(250.5);
    expect(oct.netProjected).toBe(649.5);
    expect(oct.projection).toEqual({ income: 4500, expense: 3850.5, net: 649.5 });
  });

  it("starts the dashed net line at the previous real point", () => {
    const rows = buildCashflowRows(buckets, "monthly", current);
    expect(rows[1]).toMatchObject({ net: 700, netProjected: 700, projected: false });
    expect(rows[0]).toMatchObject({ net: 2000, netProjected: null });
  });

  it("never projects below the actuals", () => {
    const rows = buildCashflowRows(buckets, "monthly", {
      ...current,
      projectedMonthEnd: { income: 4000, expense: 3000, net: 1000 },
    });
    expect(rows[2].incomeRemaining).toBe(0);
    expect(rows[2].expenseRemaining).toBe(0);
  });

  it("does not project outside the monthly range or for closed months", () => {
    for (const rows of [
      buildCashflowRows(buckets, "quarterly", current),
      buildCashflowRows(buckets, "monthly", { ...current, daysElapsed: 31 }),
    ]) {
      expect(rows.some((r) => r.projected || r.netProjected !== null)).toBe(false);
      expect(rows.map((r) => r.net)).toEqual([2000, 700, 900]);
    }
  });
});

describe("isCashflowEmpty", () => {
  it("is true only when every bucket is zero", () => {
    expect(isCashflowEmpty([{ label: "2025", income: 0, expense: 0, net: 0 }])).toBe(true);
    expect(isCashflowEmpty(buckets)).toBe(false);
  });
});

const slice = (name: string, amount: number): CategorySlice => ({
  categoryId: name,
  name,
  color: "var(--chart-1)",
  amount,
});

describe("groupCategorySlices", () => {
  it("keeps the top 5 and groups the rest into Otras", () => {
    const input = [10, 70, 30, 50, 20, 40, 60].map((a, i) => slice(`c${i}`, a));
    const { slices, total } = groupCategorySlices(input);
    expect(total).toBe(280);
    expect(slices.map((s) => s.amount)).toEqual([70, 60, 50, 40, 30, 30]);
    expect(slices[5]).toMatchObject({ id: OTHER_SLICE_ID, name: "Otras", amount: 30 });
    expect(slices.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1);
  });

  it("shows a lone sixth category by name instead of Otras", () => {
    const { slices } = groupCategorySlices([60, 50, 40, 30, 20, 10].map((a, i) => slice(`c${i}`, a)));
    expect(slices).toHaveLength(6);
    expect(slices.some((s) => s.id === OTHER_SLICE_ID)).toBe(false);
  });

  it("drops zero slices and handles no data", () => {
    expect(groupCategorySlices([slice("a", 0)])).toEqual({ slices: [], total: 0 });
  });
});
