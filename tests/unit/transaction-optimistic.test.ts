import { describe, expect, it } from "vitest";

import type { DashboardData, RecentTransaction } from "@/features/dashboard/types";
import {
  fitsListFilters,
  insertIntoList,
  insertIntoRecent,
  previewTransaction,
} from "@/features/transactions/optimistic";
import type { TransactionDTO } from "@/features/transactions/types";

const lookups = {
  accounts: [
    { id: "cash", name: "Efectivo", currency: "COP", color: null },
    { id: "nu", name: "Nu Ahorros", currency: "COP", color: "chart-2" },
  ],
  categories: [{ id: "rest", name: "Restaurantes", color: "chart-3", icon: null, parentId: "food" }],
  tags: [{ id: "t1", name: "trabajo", color: null }],
  id: "tmp",
  now: new Date("2026-10-28T12:00:00Z"),
};

const expense = previewTransaction(
  { type: "EXPENSE", accountId: "cash", amount: "18500", date: "2026-10-27", description: "Almuerzo", tagIds: ["t1"] },
  { ...lookups, suggestedCategoryId: "rest" },
);

const row = (id: string, date: string) => ({ ...expense, id, date }) as TransactionDTO;

describe("previewTransaction", () => {
  it("gasto con categoría sugerida (✦) y etiquetas", () => {
    expect(expense).toMatchObject({
      id: "tmp",
      type: "EXPENSE",
      amount: "-18500",
      currency: "COP",
      account: { id: "cash", name: "Efectivo" },
      category: { id: "rest", name: "Restaurantes" },
      autoCategorized: true,
      tags: [{ id: "t1", name: "trabajo" }],
      transfer: null,
    });
  });

  it("categoría explícita no es auto; null = sin categoría", () => {
    const base = { type: "INCOME" as const, accountId: "nu", amount: "100", date: "2026-10-28" };
    expect(previewTransaction({ ...base, categoryId: "rest" }, lookups)).toMatchObject({
      amount: "100",
      autoCategorized: false,
      category: { id: "rest" },
    });
    expect(
      previewTransaction({ ...base, categoryId: null }, { ...lookups, suggestedCategoryId: "rest" }).category,
    ).toBeNull();
  });

  it("transferencia: pata de origen con contrapartida", () => {
    const t = previewTransaction(
      { type: "TRANSFER", accountId: "cash", toAccountId: "nu", amount: "5000", date: "2026-10-28" },
      lookups,
    );
    expect(t).toMatchObject({
      amount: "-5000",
      transferGroupId: "tmp-group",
      transfer: { counterpartAccount: { id: "nu", name: "Nu Ahorros" }, direction: "out" },
    });
  });
});

describe("fitsListFilters", () => {
  it("fecha, tipo y cuenta", () => {
    expect(fitsListFilters(expense, { view: "table", dateFrom: "2026-10-01", dateTo: "2026-10-31" })).toBe(true);
    expect(fitsListFilters(expense, { dateFrom: "2026-10-28" })).toBe(false);
    expect(fitsListFilters(expense, { types: ["INCOME"] })).toBe(false);
    expect(fitsListFilters(expense, { types: "EXPENSE,INCOME" })).toBe(true);
    expect(fitsListFilters(expense, { accountIds: ["nu"] })).toBe(false);
  });

  it("búsqueda, categoría, etiqueta u orden por importe → no se puede saber", () => {
    expect(fitsListFilters(expense, { q: "alm" })).toBe(false);
    expect(fitsListFilters(expense, { categoryIds: ["rest"] })).toBe(false);
    expect(fitsListFilters(expense, { sort: "amount" })).toBe(false);
  });
});

describe("insertIntoList", () => {
  it("lista infinita ordenada por fecha desc: entra en su posición", () => {
    const old = {
      pages: [{ items: [row("a", "2026-10-28"), row("b", "2026-10-25")], nextCursor: "c1" }],
      pageParams: [null],
    };
    const next = insertIntoList(old, expense, {}) as typeof old;
    expect(next.pages[0].items.map((t) => t.id)).toEqual(["a", "tmp", "b"]);
  });

  it("más antiguo que lo cargado y hay más páginas → no se inserta", () => {
    const old = { pages: [{ items: [row("a", "2026-10-28")], nextCursor: "c1" }], pageParams: [null] };
    expect(insertIntoList(old, expense, {})).toBe(old);
  });

  it("orden asc y lista simple", () => {
    const old = { items: [row("a", "2026-10-01"), row("b", "2026-10-28")], nextCursor: null };
    const next = insertIntoList(old, expense, { order: "asc" }) as typeof old;
    expect(next.items.map((t) => t.id)).toEqual(["a", "tmp", "b"]);
  });

  it("filtros que no casan → igual", () => {
    const old = { items: [], nextCursor: null };
    expect(insertIntoList(old, expense, { types: ["INCOME"] })).toBe(old);
  });
});

describe("insertIntoRecent", () => {
  const recent = (id: string, date: string) => ({ id, date }) as RecentTransaction;
  const data = { month: "2026-10", recent: [recent("a", "2026-10-28"), recent("b", "2026-10-20")] } as DashboardData;

  it("se inserta por fecha con color de token", () => {
    const next = insertIntoRecent(data, expense)!;
    expect(next.recent.map((r) => r.id)).toEqual(["a", "tmp", "b"]);
    expect(next.recent[1]).toMatchObject({
      description: "Almuerzo",
      amount: -18500,
      categoryName: "Restaurantes",
      categoryColor: "var(--chart-3)",
      autoCategorized: true,
    });
  });

  it("otro mes → sin cambios", () => {
    const other = { ...data, month: "2026-09" };
    expect(insertIntoRecent(other, expense)).toBe(other);
  });
});
