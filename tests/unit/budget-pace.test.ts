import { describe, expect, it } from "vitest";

import { budgetRatio, budgetTone, expectedPace, fixedShare } from "@/features/dashboard/budget-pace";

describe("expectedPace", () => {
  it("is daysElapsed / daysInMonth in the current month", () => {
    expect(expectedPace({ daysElapsed: 28, daysInMonth: 31 })).toBeCloseTo(0.9032, 3);
  });
  it("is 1 for a past month", () => {
    expect(expectedPace({ daysElapsed: 30, daysInMonth: 30 })).toBe(1);
  });
  it("is null for a future month", () => {
    expect(expectedPace({ daysElapsed: 0, daysInMonth: 31 })).toBeNull();
  });
});

describe("budgetRatio", () => {
  it("divides spent by limit", () => {
    expect(budgetRatio({ spent: 433_500, limit: 500_000 })).toBeCloseTo(0.867);
  });
  it("handles a zero limit", () => {
    expect(budgetRatio({ spent: 0, limit: 0 })).toBe(0);
    expect(budgetRatio({ spent: 10, limit: 0 })).toBe(1);
  });
});

describe("budgetTone", () => {
  it("is over at or above 100 %", () => {
    expect(budgetTone(1, 0.8, 0.5)).toBe("over");
    expect(budgetTone(1.2, 0.8, null)).toBe("over");
  });
  it("is warning at or above the alert threshold", () => {
    expect(budgetTone(0.8, 0.8, 0.9)).toBe("warning");
    expect(budgetTone(0.867, 0.8, 0.903)).toBe("warning");
  });
  it("is ahead above the pace but below the threshold", () => {
    expect(budgetTone(0.6, 0.8, 0.47)).toBe("ahead");
  });
  it("is normal at or below the pace, or without a pace", () => {
    expect(budgetTone(0.47, 0.8, 0.47)).toBe("normal");
    expect(budgetTone(0.6, 0.8, null)).toBe("normal");
  });
});

describe("fixedShare", () => {
  it("returns the fixed fraction", () => {
    expect(fixedShare(300, 100)).toBe(0.75);
  });
  it("is null without expenses", () => {
    expect(fixedShare(0, 0)).toBeNull();
  });
});
