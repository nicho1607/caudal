import { describe, expect, it } from "vitest";
import { formatMoney, relativeChange } from "@/lib/format";

describe("formatMoney", () => {
  it("uses the typographic minus sign (U+2212) for negatives", () => {
    const out = formatMoney(-12.5);
    expect(out.startsWith("−")).toBe(true);
    expect(out).not.toContain("-");
  });

  it("adds + to positives when signed", () => {
    expect(formatMoney(10, { signed: true }).startsWith("+")).toBe(true);
    expect(formatMoney(10).startsWith("+")).toBe(false);
  });

  it("does not sign zero", () => {
    expect(formatMoney(0, { signed: true }).startsWith("+")).toBe(false);
  });
});

describe("relativeChange", () => {
  it("returns null when the previous value is 0", () => {
    expect(relativeChange(100, 0)).toBeNull();
  });

  it("uses the absolute previous value as base", () => {
    expect(relativeChange(150, 100)).toBe(0.5);
    expect(relativeChange(-50, -100)).toBe(0.5);
  });
});
