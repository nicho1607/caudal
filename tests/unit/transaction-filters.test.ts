import { describe, expect, it } from "vitest";

import {
  hasActiveFilters,
  isIsoDate,
  loadTransactionFilters,
  monthRange,
  resolveDateRange,
  resolveMonth,
  toListQuery,
  toSearchParams,
  transactionsListKey,
  type TransactionFilters,
} from "@/features/transactions/filters";
import { listTransactionsQuerySchema } from "@/features/transactions/schemas";
import { queryKeys } from "@/lib/query-keys";

const empty: TransactionFilters = {
  q: "",
  from: null,
  to: null,
  type: [],
  account: [],
  category: [],
  tag: [],
  sort: "date-desc",
};

describe("transaction filters", () => {
  it("parses the URL state with defaults", () => {
    const f = loadTransactionFilters("?q=rappi&type=EXPENSE,BOGUS&account=a,b&sort=amount-asc&from=2026-10-01");
    expect(f).toMatchObject({ q: "rappi", type: ["EXPENSE"], account: ["a", "b"], sort: "amount-asc", from: "2026-10-01", to: null });
    expect(loadTransactionFilters("?sort=nope").sort).toBe("date-desc");
  });

  it("defaults the date range to the selected month (Feb, leap years, invalid month)", () => {
    expect(monthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(monthRange("2028-02").to).toBe("2028-02-29");
    expect(resolveMonth("2026-13", "2026-10")).toBe("2026-10");
    expect(resolveMonth("2026-09", "2026-10")).toBe("2026-09");
    expect(resolveDateRange(empty, "2026-10")).toEqual({ from: "2026-10-01", to: "2026-10-31", isMonth: true });
  });

  it("explicit from/to override the month; invalid dates are ignored and inverted ranges sorted", () => {
    expect(resolveDateRange({ from: "2026-09-10", to: null }, "2026-10")).toEqual({ from: "2026-09-10", to: undefined, isMonth: false });
    expect(resolveDateRange({ from: "2026-10-20", to: "2026-10-01" }, "2026-10")).toMatchObject({ from: "2026-10-01", to: "2026-10-20" });
    expect(resolveDateRange({ from: "2026-02-31", to: null }, "2026-10").isMonth).toBe(true);
    expect(isIsoDate("2026-02-31")).toBe(false);
  });

  it("only user-set filters count as active (the month default does not)", () => {
    expect(hasActiveFilters(empty)).toBe(false);
    expect(hasActiveFilters({ ...empty, sort: "amount-asc" })).toBe(false);
    expect(hasActiveFilters({ ...empty, q: "  " })).toBe(false);
    expect(hasActiveFilters({ ...empty, tag: ["t"] })).toBe(true);
    expect(hasActiveFilters({ ...empty, to: "2026-10-01" })).toBe(true);
  });

  it("maps to an API query that the server schema accepts, collapsing transfers", () => {
    const query = toListQuery({ ...empty, q: " éxito ", type: ["TRANSFER"], account: ["a", "a"], sort: "amount-asc" }, "2026-10");
    expect(query).toEqual({
      dateFrom: "2026-10-01",
      dateTo: "2026-10-31",
      q: "éxito",
      types: ["TRANSFER"],
      accountIds: ["a"],
      categoryIds: undefined,
      tagIds: undefined,
      collapseTransfers: true,
      sort: "amount",
      order: "asc",
      limit: 50,
    });
    const params = toSearchParams(query, "cur");
    expect(params.get("accountIds")).toBe("a");
    expect(params.has("categoryIds")).toBe(false);
    const parsed = listTransactionsQuerySchema.parse(Object.fromEntries(params));
    expect(parsed).toMatchObject({ collapseTransfers: true, cursor: "cur", sort: "amount", order: "asc" });
  });

  it("keys live under transactions.lists() (optimistic delete) and ignore undefined values", () => {
    const key = transactionsListKey(toListQuery(empty, "2026-10"));
    expect(key.slice(0, 2)).toEqual(queryKeys.transactions.lists());
    expect(Object.values(key[2]).includes(undefined)).toBe(false);
  });
});
