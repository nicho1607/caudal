import { describe, expect, it } from "vitest";

import { recentTitle } from "@/features/dashboard/components/recent-transactions";
import type { RecentTransaction } from "@/features/dashboard/types";
import {
  absAmount,
  duplicateInput,
  matchesTarget,
  toFormValues,
  toUpdatePayload,
} from "@/features/transactions/form";
import { transactionFormSchema } from "@/features/transactions/schemas";
import type { TransactionDTO } from "@/features/transactions/types";
import { formatShortDate } from "@/lib/format";

function dto(overrides: Partial<TransactionDTO> = {}): TransactionDTO {
  return {
    id: "t1",
    type: "EXPENSE",
    status: "CLEARED",
    date: "2026-10-27",
    amount: "-186400",
    amountBase: "-186400",
    currency: "COP",
    fxRate: "1",
    description: "ÉXITO COLINA*4821",
    notes: null,
    autoCategorized: true,
    categorizationRuleId: "r1",
    recurringRuleId: null,
    transferGroupId: null,
    account: { id: "acc-nu", name: "Tarjeta Nu", currency: "COP", color: null },
    category: { id: "cat-mercado", name: "Mercado", color: "chart-1", icon: null, parentId: "cat-alim" },
    payee: { id: "p1", name: "Éxito" },
    tags: [{ id: "tag1", name: "Casa", color: null }],
    transfer: null,
    deletedAt: null,
    createdAt: "2026-10-27T10:00:00.000Z",
    updatedAt: "2026-10-27T10:00:00.000Z",
    ...overrides,
  };
}

const transfer = (direction: "out" | "in") =>
  dto({
    type: "TRANSFER",
    amount: direction === "out" ? "-600000" : "600000",
    description: "Ahorro mensual",
    category: null,
    payee: null,
    autoCategorized: false,
    transferGroupId: "g1",
    account: direction === "out"
      ? { id: "acc-bc", name: "Bancolombia Ahorros", currency: "COP", color: null }
      : { id: "acc-nuah", name: "Nu Ahorros", currency: "COP", color: null },
    transfer: {
      counterpartId: "t2",
      counterpartAccount: direction === "out" ? { id: "acc-nuah", name: "Nu Ahorros" } : { id: "acc-bc", name: "Bancolombia Ahorros" },
      direction,
    },
  });

describe("transaction form helpers", () => {
  it("absAmount strips the sign", () => {
    expect(absAmount("-217400")).toBe("217400");
    expect(absAmount("12.5")).toBe("12.5");
  });

  it("toFormValues maps a DTO to string fields", () => {
    expect(toFormValues(dto())).toEqual({
      description: "ÉXITO COLINA*4821",
      payee: "Éxito",
      amount: "186400",
      date: "2026-10-27",
      accountId: "acc-nu",
      categoryId: "cat-mercado",
      notes: "",
    });
  });

  it("toUpdatePayload sends only dirty fields, empty → null, comma decimals", () => {
    const values = { ...toFormValues(dto()), categoryId: "", notes: "  ", amount: "12,5" };
    expect(toUpdatePayload(values, {}, "EXPENSE")).toBeNull();
    expect(toUpdatePayload(values, { categoryId: true, notes: true, amount: true }, "EXPENSE")).toEqual({
      categoryId: null,
      notes: null,
      amount: "12.5",
    });
  });

  it("toUpdatePayload never sends category/payee for transfers", () => {
    const values = toFormValues(transfer("out"));
    expect(toUpdatePayload(values, { categoryId: true, payee: true }, "TRANSFER")).toBeNull();
    expect(toUpdatePayload(values, { date: true, payee: true }, "TRANSFER")).toEqual({ date: "2026-10-27" });
  });

  it("duplicateInput copies an expense dated today", () => {
    expect(duplicateInput(dto(), "2026-10-28")).toEqual({
      type: "EXPENSE",
      amount: "186400",
      date: "2026-10-28",
      description: "ÉXITO COLINA*4821",
      notes: null,
      tagIds: ["tag1"],
      accountId: "acc-nu",
      categoryId: "cat-mercado",
      payee: "Éxito",
    });
  });

  it("duplicateInput keeps the transfer direction from either leg", () => {
    for (const leg of [transfer("out"), transfer("in")]) {
      expect(duplicateInput(leg, "2026-10-28")).toMatchObject({
        type: "TRANSFER",
        amount: "600000",
        accountId: "acc-bc",
        toAccountId: "acc-nuah",
      });
    }
  });

  it("matchesTarget matches by id or by transfer group", () => {
    expect(matchesTarget({ id: "a" }, { id: "a", transferGroupId: null })).toBe(true);
    expect(matchesTarget({ id: "b", transferGroupId: "g" }, { id: "a", transferGroupId: "g" })).toBe(true);
    expect(matchesTarget({ id: "b", transferGroupId: null }, { id: "a", transferGroupId: null })).toBe(false);
  });

  it("transactionFormSchema validates amount and date", () => {
    const ok = transactionFormSchema.safeParse(toFormValues(dto()));
    expect(ok.success).toBe(true);
    const bad = transactionFormSchema.safeParse({ ...toFormValues(dto()), amount: "0", date: "27/10/2026" });
    expect(bad.success).toBe(false);
    const paths = bad.error!.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["amount", "date"]));
    expect(transactionFormSchema.safeParse({ ...toFormValues(dto()), amount: "1,5" }).success).toBe(true);
  });
});

describe("recent transactions widget helpers", () => {
  const row = (o: Partial<RecentTransaction>): RecentTransaction => ({
    id: "t1",
    date: "2026-10-27",
    description: "ÉXITO COLINA*4821",
    payee: "Éxito",
    categoryName: "Mercado",
    categoryColor: null,
    accountName: "Tarjeta Nu",
    type: "EXPENSE",
    amount: -186400,
    currency: "COP",
    status: "CLEARED",
    autoCategorized: true,
    transferGroupId: null,
    counterpartAccountName: null,
    ...o,
  });

  it("recentTitle: payee first, transfers as origin → destination", () => {
    expect(recentTitle(row({}))).toBe("Éxito");
    expect(recentTitle(row({ payee: null }))).toBe("ÉXITO COLINA*4821");
    expect(recentTitle(row({ payee: null, description: "" }))).toBe("Sin descripción");
    expect(
      recentTitle(
        row({ type: "TRANSFER", accountName: "Bancolombia Ahorros", counterpartAccountName: "Nu Ahorros" }),
      ),
    ).toBe("Bancolombia Ahorros → Nu Ahorros");
  });

  it("formatShortDate gives '27 oct' without 'de' or a trailing dot", () => {
    expect(formatShortDate("2026-10-27", "es-CO")).toBe("27 oct");
    expect(formatShortDate("2026-09-07", "es-ES")).toBe("7 sept");
    expect(formatShortDate("2026-01-01", "es-CO")).toBe("1 ene");
  });
});

describe("changedFields", () => {
  it("flags only fields whose trimmed value changed", async () => {
    const { changedFields } = await import("@/features/transactions/form");
    const initial = toFormValues(dto());
    expect(changedFields({ ...initial, notes: "  " }, initial)).toEqual({});
    expect(changedFields({ ...initial, categoryId: "cat-rest", amount: "1000" }, initial)).toEqual({
      categoryId: true,
      amount: true,
    });
  });
});
