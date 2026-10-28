// @vitest-environment node
import { describe, expect, it } from "vitest";

import { creditUsage, groupAccounts, netWorth, archivedAccounts } from "@/features/accounts/calc";
import { suggestColor, toCreateInput, toFormValues, toUpdatePayload } from "@/features/accounts/form";
import {
  accountFormSchema,
  createAccountSchema,
  parseMoneyInput,
  updateAccountSchema,
  type AccountFormValues,
} from "@/features/accounts/schemas";
import type { AccountDTO } from "@/features/accounts/types";
import { Prisma } from "@/generated/prisma/client";
import { HttpError } from "@/server/errors";
import { resolveAccountState } from "@/server/services/account.logic";

const D = (v: string | number) => new Prisma.Decimal(v);

function account(overrides: Partial<AccountDTO> = {}): AccountDTO {
  return {
    id: "a1",
    name: "Bancolombia",
    type: "SAVINGS",
    currency: "COP",
    color: "chart-1",
    balance: 1_000_000,
    initialBalance: 0,
    creditLimit: null,
    institution: null,
    last4: null,
    includeInNetWorth: true,
    archivedAt: null,
    hasTransactions: false,
    ...overrides,
  };
}

const formValues = (overrides: Partial<AccountFormValues> = {}): AccountFormValues => ({
  ...toFormValues(null, "COP", "chart-2"),
  name: "Nu",
  ...overrides,
});

describe("parseMoneyInput", () => {
  it("treats . and , as thousands separators in zero-decimal currencies", () => {
    expect(parseMoneyInput("1.500.000", "COP")).toBe("1500000");
    expect(parseMoneyInput("$ 1,500,000", "COP")).toBe("1500000");
    expect(parseMoneyInput("-250.000", "COP")).toBe("-250000");
    expect(parseMoneyInput("−250000", "COP")).toBe("-250000");
    expect(parseMoneyInput("12,5", "COP")).toBeNull();
  });

  it("reads the last separator with 1–2 digits as decimal in other currencies", () => {
    expect(parseMoneyInput("1.234,56", "EUR")).toBe("1234.56");
    expect(parseMoneyInput("1,234.5", "USD")).toBe("1234.5");
    expect(parseMoneyInput("12,5", "USD")).toBe("12.5");
    expect(parseMoneyInput("1,234", "USD")).toBe("1234");
  });

  it("rejects malformed input and normalizes zero", () => {
    expect(parseMoneyInput("abc", "COP")).toBeNull();
    expect(parseMoneyInput("1.50.000", "COP")).toBeNull();
    expect(parseMoneyInput("--5", "COP")).toBeNull();
    expect(parseMoneyInput("-0", "COP")).toBe("0");
    expect(parseMoneyInput("007", "COP")).toBe("7");
  });
});

describe("accountFormSchema", () => {
  it("requires a name and a valid last4", () => {
    const result = accountFormSchema.safeParse(formValues({ name: " ", last4: "12" }));
    expect(result.success).toBe(false);
    const paths = result.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["name", "last4"]));
  });

  it("validates the initial balance with the currency and the credit limit only for cards", () => {
    expect(accountFormSchema.safeParse(formValues({ initialBalance: "12,5" })).success).toBe(false);
    expect(accountFormSchema.safeParse(formValues({ initialBalance: "-1.200.000" })).success).toBe(true);
    expect(accountFormSchema.safeParse(formValues({ type: "CREDIT_CARD", creditLimit: "-5" })).success).toBe(false);
    expect(accountFormSchema.safeParse(formValues({ type: "CREDIT_CARD", creditLimit: "0" })).success).toBe(false);
    // Un cupo raro en una cuenta que no es tarjeta se ignora (el campo está oculto).
    expect(accountFormSchema.safeParse(formValues({ type: "SAVINGS", creditLimit: "-5" })).success).toBe(true);
  });
});

describe("API schemas", () => {
  it("accepts a minimal create body and uppercases the currency", () => {
    const parsed = createAccountSchema.parse({ name: "Efectivo", type: "CASH", currency: "cop" });
    expect(parsed.currency).toBe("COP");
  });

  it("rejects unknown fields, bad colors and empty patches", () => {
    expect(createAccountSchema.safeParse({ name: "x", type: "CASH", userId: "u" }).success).toBe(false);
    expect(createAccountSchema.safeParse({ name: "x", type: "CASH", color: "red" }).success).toBe(false);
    expect(createAccountSchema.safeParse({ name: "x", type: "CASH", creditLimit: 0 }).success).toBe(false);
    expect(updateAccountSchema.safeParse({}).success).toBe(false);
    expect(updateAccountSchema.safeParse({ name: "Nuevo" }).success).toBe(true);
  });
});

describe("form mapping", () => {
  it("builds the create body (nulls for empty, limit only for cards)", () => {
    expect(toCreateInput(formValues({ institution: " ", initialBalance: "1.500.000", creditLimit: "9" }))).toEqual({
      name: "Nu",
      type: "SAVINGS",
      currency: "COP",
      institution: null,
      last4: null,
      initialBalance: "1500000",
      creditLimit: null,
      color: "chart-2",
      includeInNetWorth: true,
    });
    expect(toCreateInput(formValues({ type: "CREDIT_CARD", creditLimit: "4.000.000" })).creditLimit).toBe("4000000");
  });

  it("sends only changed fields in the PATCH, null when nothing changed", () => {
    const acc = account({ type: "CREDIT_CARD", creditLimit: 4_000_000, institution: "Nu", last4: "4821" });
    const values = toFormValues(acc, "COP");
    expect(toUpdatePayload(values, acc)).toBeNull();
    expect(toUpdatePayload({ ...values, name: "Tarjeta Nu", creditLimit: "5.000.000", last4: "" }, acc)).toEqual({
      name: "Tarjeta Nu",
      creditLimit: "5000000",
      last4: null,
    });
  });

  it("suggests the first unused color", () => {
    expect(suggestColor([{ color: "chart-1", archivedAt: null }, { color: "chart-2", archivedAt: "2026-10-01" }])).toBe(
      "chart-2",
    );
  });
});

describe("account calc", () => {
  const accounts = [
    account({ id: "s", type: "SAVINGS", balance: 2_000_000 }),
    account({ id: "c", type: "CREDIT_CARD", balance: -3_400_000, creditLimit: 4_000_000 }),
    account({ id: "x", type: "CASH", balance: 50_000, includeInNetWorth: false }),
    account({ id: "u", type: "SAVINGS", currency: "USD", balance: 100 }),
    account({ id: "arch", type: "INVESTMENT", balance: 9_000_000, archivedAt: "2026-10-01T00:00:00.000Z" }),
  ];

  it("groups active accounts by type in a fixed order with base-currency subtotals", () => {
    const groups = groupAccounts(accounts, "COP");
    expect(groups.map((g) => [g.label, g.subtotal, g.hasOtherCurrencies])).toEqual([
      ["Ahorros", 2_000_000, true],
      ["Tarjetas de crédito", -3_400_000, false],
      ["Efectivo", 50_000, false],
    ]);
  });

  it("computes net worth from included base-currency accounts (cards subtract)", () => {
    expect(netWorth(accounts, "COP")).toEqual({ total: -1_400_000, excludedOtherCurrency: 1 });
  });

  it("reports credit usage with a warning from 80 %", () => {
    expect(creditUsage(accounts[1]!)).toEqual({ used: 3_400_000, limit: 4_000_000, ratio: 0.85, warning: true });
    expect(creditUsage({ type: "CREDIT_CARD", balance: 20_000, creditLimit: 1_000 })).toMatchObject({ used: 0, warning: false });
    expect(creditUsage({ type: "CREDIT_CARD", balance: -5, creditLimit: null })).toBeNull();
    expect(creditUsage({ type: "SAVINGS", balance: -5, creditLimit: 100 })).toBeNull();
  });

  it("lists archived accounts, newest first", () => {
    const list = archivedAccounts([
      account({ id: "old", archivedAt: "2026-01-01T00:00:00.000Z" }),
      account({ id: "new", archivedAt: "2026-10-01T00:00:00.000Z" }),
      account({ id: "active" }),
    ]);
    expect(list.map((a) => a.id)).toEqual(["new", "old"]);
  });
});

describe("resolveAccountState", () => {
  const current = { type: "CREDIT_CARD" as const, currency: "COP", initialBalance: D(0), creditLimit: D(4_000_000) };

  it("blocks type/currency changes once the account has transactions", () => {
    expect(() => resolveAccountState(current, { type: "SAVINGS" }, true)).toThrow(
      /No se puede cambiar el tipo de una cuenta que ya tiene movimientos/,
    );
    expect(() => resolveAccountState(current, { currency: "USD" }, true)).toThrow(/moneda/);
    // Mismo valor = no es un cambio.
    expect(resolveAccountState(current, { type: "CREDIT_CARD", currency: "COP" }, true).type).toBe("CREDIT_CARD");
  });

  it("allows them without transactions and drops the credit limit when it stops being a card", () => {
    const state = resolveAccountState(current, { type: "SAVINGS", currency: "USD" }, false);
    expect(state).toMatchObject({ type: "SAVINGS", currency: "USD", creditLimit: null });
  });

  it("validates decimals against the final currency", () => {
    expect(() => resolveAccountState(null, { type: "CASH", currency: "COP", initialBalance: "10.5" }, false)).toThrow(
      HttpError,
    );
    expect(resolveAccountState(null, { type: "CASH", currency: "USD", initialBalance: "10.5" }, false).initialBalance.toFixed()).toBe(
      "10.5",
    );
    const withDecimals = { ...current, type: "SAVINGS" as const, currency: "USD", initialBalance: D("10.5") };
    expect(() => resolveAccountState(withDecimals, { currency: "COP" }, false)).toThrow(/no llevan decimales/);
  });

  it("keeps the existing limit and rejects a non-positive one", () => {
    expect(resolveAccountState(current, {}, true).creditLimit?.toFixed()).toBe("4000000");
    expect(resolveAccountState(current, { creditLimit: null }, true).creditLimit).toBeNull();
    expect(() => resolveAccountState(current, { creditLimit: 0 }, true)).toThrow(/mayor que 0/);
  });
});
