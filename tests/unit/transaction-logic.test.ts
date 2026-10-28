// @vitest-environment node
import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import {
  createTransactionSchema,
  listTransactionsQuerySchema,
  updateTransactionSchema,
} from "@/features/transactions/schemas";
import { HttpError } from "@/server/errors";
import {
  buildTransferLegs,
  decodeCursor,
  encodeCursor,
  escapeLike,
  moneyFields,
  MULTICURRENCY_UNSUPPORTED,
  parseAmount,
  signedAmount,
} from "@/server/services/transaction.logic";

const D = (v: number | string) => new Prisma.Decimal(v);

function httpError(fn: () => unknown): HttpError {
  try {
    fn();
  } catch (e) {
    if (e instanceof HttpError) return e;
    throw e;
  }
  throw new Error("expected HttpError");
}

describe("signedAmount", () => {
  it("INCOME is positive and EXPENSE negative, whatever the input sign", () => {
    expect(signedAmount("INCOME", D(4500000)).toFixed()).toBe("4500000");
    expect(signedAmount("EXPENSE", D(217400)).toFixed()).toBe("-217400");
    expect(signedAmount("EXPENSE", D(-5)).toFixed()).toBe("-5");
    expect(signedAmount("INCOME", D(-5)).toFixed()).toBe("5");
  });
});

describe("parseAmount", () => {
  it("accepts whole pesos for COP and rejects decimals", () => {
    expect(parseAmount(12500, "COP").toFixed()).toBe("12500");
    expect(parseAmount("12500", "COP").toFixed()).toBe("12500");
    expect(httpError(() => parseAmount(12500.5, "COP")).status).toBe(400);
  });

  it("allows up to 2 decimals for EUR/USD", () => {
    expect(parseAmount("12.34", "EUR").toFixed()).toBe("12.34");
    expect(parseAmount(0.1, "USD").toFixed()).toBe("0.1");
    expect(httpError(() => parseAmount("1.234", "EUR")).status).toBe(400);
  });

  it("rejects zero, negatives and garbage", () => {
    expect(httpError(() => parseAmount(0, "COP")).status).toBe(400);
    expect(httpError(() => parseAmount(-10, "COP")).status).toBe(400);
    expect(httpError(() => parseAmount("abc", "COP")).status).toBe(400);
  });
});

describe("moneyFields", () => {
  it("uses fxRate 1 and amountBase = amount when the account is in the base currency", () => {
    const m = moneyFields(D(-30500), "COP", "COP");
    expect(m.fxRate.toFixed()).toBe("1");
    expect(m.amountBase.toFixed()).toBe("-30500");
    expect(m.currency).toBe("COP");
  });

  it("rejects other currencies until FX exists", () => {
    const e = httpError(() => moneyFields(D(10), "USD", "COP"));
    expect(e.status).toBe(400);
    expect(e.message).toBe(MULTICURRENCY_UNSUPPORTED);
  });
});

describe("buildTransferLegs", () => {
  const from = { id: "a", currency: "COP" };
  const to = { id: "b", currency: "COP" };

  it("creates an outgoing negative leg and an incoming positive leg with the same group", () => {
    const [out, inc] = buildTransferLegs(from, to, D(600000), "COP", "g1");
    expect(out).toMatchObject({ accountId: "a", transferGroupId: "g1" });
    expect(inc).toMatchObject({ accountId: "b", transferGroupId: "g1" });
    expect(out.amount.toFixed()).toBe("-600000");
    expect(inc.amount.toFixed()).toBe("600000");
    expect(out.amount.add(inc.amount).isZero()).toBe(true);
    expect(out.amountBase.toFixed()).toBe("-600000");
  });

  it("generates a group id when none is given", () => {
    const [out, inc] = buildTransferLegs(from, to, D(1), "COP");
    expect(out.transferGroupId).toMatch(/^[0-9a-f-]{36}$/);
    expect(inc.transferGroupId).toBe(out.transferGroupId);
  });

  it("rejects same account and foreign currency", () => {
    expect(httpError(() => buildTransferLegs(from, from, D(1), "COP")).status).toBe(400);
    expect(httpError(() => buildTransferLegs(from, { id: "b", currency: "USD" }, D(1), "COP")).message).toBe(
      MULTICURRENCY_UNSUPPORTED,
    );
  });
});

describe("cursor", () => {
  it("round-trips and is bound to the sort", () => {
    const raw = encodeCursor({ sort: "amount", value: "-217400", id: "cm1" });
    expect(decodeCursor(raw, "amount")).toEqual({ sort: "amount", value: "-217400", id: "cm1" });
    expect(httpError(() => decodeCursor(raw, "date")).status).toBe(400);
    expect(httpError(() => decodeCursor("nope", "date")).status).toBe(400);
    const bad = Buffer.from(JSON.stringify(["date", "x'; drop", "id"])).toString("base64url");
    expect(httpError(() => decodeCursor(bad, "date")).status).toBe(400);
  });
});

describe("escapeLike", () => {
  it("escapes LIKE wildcards", () => {
    expect(escapeLike("50%_off\\")).toBe(String.raw`50\%\_off\\`);
  });
});

describe("schemas", () => {
  it("rejects category/payee on transfers and same-account transfers", () => {
    const base = { type: "TRANSFER", accountId: "a", toAccountId: "b", amount: 1, date: "2026-10-28" };
    expect(createTransactionSchema.safeParse(base).success).toBe(true);
    expect(createTransactionSchema.safeParse({ ...base, categoryId: "c" }).success).toBe(false);
    expect(createTransactionSchema.safeParse({ ...base, toAccountId: "a" }).success).toBe(false);
  });

  it("requires a positive amount and an ISO date", () => {
    const base = { type: "EXPENSE", accountId: "a", amount: 1000, date: "2026-10-28" };
    expect(createTransactionSchema.safeParse(base).success).toBe(true);
    expect(createTransactionSchema.safeParse({ ...base, amount: -1000 }).success).toBe(false);
    expect(createTransactionSchema.safeParse({ ...base, date: "28/10/2026" }).success).toBe(false);
  });

  it("list query accepts repeated or comma-separated ids and applies defaults", () => {
    const q = listTransactionsQuerySchema.parse({ accountIds: "a,b", types: ["INCOME", "EXPENSE"], limit: "10" });
    expect(q).toMatchObject({ accountIds: ["a", "b"], types: ["INCOME", "EXPENSE"], limit: 10, sort: "date", order: "desc" });
    expect(listTransactionsQuerySchema.safeParse({ dateFrom: "2026-10-02", dateTo: "2026-10-01" }).success).toBe(false);
  });

  it("an empty PATCH is rejected", () => {
    expect(updateTransactionSchema.safeParse({}).success).toBe(false);
    expect(updateTransactionSchema.safeParse({ categoryId: null }).success).toBe(true);
  });
});
