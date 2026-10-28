import { describe, expect, it } from "vitest";
import { formatMoney, relativeChange } from "@/lib/format";

// Intl separa símbolo e importe con NBSP; se normaliza para comparar.
const plain = (s: string) => s.replace(/ /g, " ");

describe("formatMoney", () => {
  it("defaults to COP / es-CO with no decimals", () => {
    expect(plain(formatMoney(5_555_000))).toBe("$ 5.555.000");
    expect(plain(formatMoney(4_500_000.4))).toBe("$ 4.500.000");
  });

  it("groups 4-digit amounts", () => {
    expect(plain(formatMoney(5_555))).toBe("$ 5.555");
  });

  it("uses the typographic minus sign (U+2212) for negatives", () => {
    const out = formatMoney(-1_400_000);
    expect(plain(out)).toBe("−$ 1.400.000");
    expect(out).not.toContain("-");
  });

  it("does not sign amounts that round to zero", () => {
    expect(plain(formatMoney(-0.3))).toBe("$ 0");
  });

  it("keeps 2 decimals for currencies with a minor unit", () => {
    expect(plain(formatMoney(1234.5, { currency: "EUR", locale: "es-ES" }))).toBe("1.234,50 €");
  });

  it("formats other zero-decimal currencies without decimals", () => {
    expect(formatMoney(1234.6, { currency: "JPY", locale: "es-CO" })).not.toMatch(/,\d/);
    expect(formatMoney(1234.6, { currency: "CLP", locale: "es-CO" })).not.toMatch(/,\d/);
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
