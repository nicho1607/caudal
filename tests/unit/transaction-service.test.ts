// @vitest-environment node
// Tests de servicio contra la BD local real (DATABASE_URL de .env). Cada
// ejecución crea dos usuarios desechables (A y B) con sus cuentas y los borra
// al final; nunca toca al usuario demo. Se saltan si no hay DATABASE_URL.
import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("transaction.service (DB)", async () => {
  const { db } = await import("@/server/db");
  const svc = await import("@/server/services/transaction.service");

  const userA = { id: randomUUID(), baseCurrency: "COP" };
  const userB = { id: randomUUID(), baseCurrency: "COP" };
  const ids = {} as Record<
    "checking" | "savings" | "usd" | "groceries" | "salary" | "restaurants" | "tag" | "ruleExito" | "bAccount",
    string
  >;

  beforeAll(async () => {
    for (const u of [userA, userB]) {
      await db.user.create({
        data: { id: u.id, email: `txn-test-${u.id}@caudal.test`, baseCurrency: "COP", locale: "es-CO" },
      });
    }
    const mk = (name: string, currency = "COP", userId = userA.id) =>
      db.account.create({ data: { userId, name, type: "SAVINGS", currency }, select: { id: true } });
    ids.checking = (await mk("Test ahorros")).id;
    ids.savings = (await mk("Test Nu")).id;
    ids.usd = (await mk("Test USD", "USD")).id;
    ids.bAccount = (await mk("Cuenta de B", "COP", userB.id)).id;
    const cat = (name: string, kind: "INCOME" | "EXPENSE") =>
      db.category.create({ data: { userId: userA.id, name, kind }, select: { id: true } });
    ids.groceries = (await cat("Mercado", "EXPENSE")).id;
    ids.restaurants = (await cat("Restaurantes", "EXPENSE")).id;
    ids.salary = (await cat("Nómina", "INCOME")).id;
    ids.tag = (await db.tag.create({ data: { userId: userA.id, name: "viaje" }, select: { id: true } })).id;
    ids.ruleExito = (
      await db.categorizationRule.create({
        data: {
          userId: userA.id,
          categoryId: ids.groceries,
          field: "DESCRIPTION",
          match: "CONTAINS",
          pattern: "exito",
          priority: 1000,
          source: "SYSTEM",
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    const userIds = [userA.id, userB.id];
    // Transaction.account es Restrict: borrar movimientos antes que el usuario.
    await db.transaction.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("applies the sign server-side from the type and stores amountBase/fxRate", async () => {
    const expense = await svc.createTransaction(userA, {
      type: "EXPENSE",
      accountId: ids.checking,
      amount: 30500,
      date: "2026-10-20",
      categoryId: ids.groceries,
      tagIds: [ids.tag],
    });
    expect(expense).toMatchObject({
      type: "EXPENSE",
      amount: "-30500",
      amountBase: "-30500",
      fxRate: "1",
      currency: "COP",
      date: "2026-10-20",
      account: { id: ids.checking, name: "Test ahorros" },
      category: { id: ids.groceries, name: "Mercado" },
      tags: [{ id: ids.tag, name: "viaje" }],
      transfer: null,
    });

    const income = await svc.createTransaction(userA, {
      type: "INCOME",
      accountId: ids.checking,
      amount: "4500000",
      date: "2026-10-25",
      categoryId: ids.salary,
      payee: "Soluciones Andinas S.A.S.",
    });
    expect(income.amount).toBe("4500000");
    expect(income.payee?.name).toBe("Soluciones Andinas S.A.S.");

    // PATCH a INCOME → EXPENSE invierte el signo y suelta la categoría de ingresos.
    const flipped = await svc.updateTransaction(userA, income.id, { type: "EXPENSE", amount: 100 });
    expect(flipped).toMatchObject({ type: "EXPENSE", amount: "-100", amountBase: "-100", category: null });
  });

  it("rejects COP decimals, foreign currency accounts and mismatched categories", async () => {
    const base = { type: "EXPENSE" as const, accountId: ids.checking, date: "2026-10-20" };
    await expect(svc.createTransaction(userA, { ...base, amount: 10.5 })).rejects.toMatchObject({ status: 400 });
    await expect(svc.createTransaction(userA, { ...base, accountId: ids.usd, amount: 10 })).rejects.toMatchObject({
      status: 400,
      message: "multimoneda aún no soportado",
    });
    await expect(
      svc.createTransaction(userA, { ...base, amount: 10, categoryId: ids.salary }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("auto-categorizes when categoryId is absent, finds-or-creates the payee and learns from corrections", async () => {
    const first = await svc.createTransaction(userA, {
      type: "EXPENSE",
      accountId: ids.checking,
      amount: 217400,
      date: "2026-10-21",
      description: "ÉXITO COLINA*4821",
      payee: "Éxito",
    });
    expect(first).toMatchObject({
      category: { id: ids.groceries },
      autoCategorized: true,
      categorizationRuleId: ids.ruleExito,
    });
    const rule = await db.categorizationRule.findUniqueOrThrow({ where: { id: ids.ruleExito } });
    expect(rule.hitCount).toBe(1);

    const second = await svc.createTransaction(userA, {
      type: "EXPENSE",
      accountId: ids.checking,
      amount: 1000,
      date: "2026-10-21",
      payee: "EXITO",
      categoryId: null,
    });
    expect(second.payee?.id).toBe(first.payee?.id); // mismo normalizedName → mismo Payee
    expect(second.category).toBeNull();
    expect(second.autoCategorized).toBe(false);

    const corrected = await svc.updateTransaction(userA, first.id, { categoryId: ids.restaurants });
    expect(corrected).toMatchObject({ category: { id: ids.restaurants }, autoCategorized: false, categorizationRuleId: null });
    await svc.updateTransaction(userA, second.id, { categoryId: ids.restaurants });
    const learned = await db.categorizationRule.findFirst({
      where: { userId: userA.id, source: "LEARNED", categoryId: ids.restaurants },
    });
    expect(learned?.pattern).toBe("exito");
  });

  it("creates transfers as two legs with a shared group and moves both on patch/delete/restore", async () => {
    const out = await svc.createTransaction(userA, {
      type: "TRANSFER",
      accountId: ids.checking,
      toAccountId: ids.savings,
      amount: 600000,
      date: "2026-10-26",
      description: "Ahorro mensual",
    });
    expect(out).toMatchObject({
      type: "TRANSFER",
      amount: "-600000",
      category: null,
      payee: null,
      transfer: { direction: "out", counterpartAccount: { id: ids.savings, name: "Test Nu" } },
    });
    const legs = await db.transaction.findMany({ where: { transferGroupId: out.transferGroupId! } });
    expect(legs).toHaveLength(2);
    expect(legs.map((l) => l.amount.toNumber()).sort((a, b) => a - b)).toEqual([-600000, 600000]);
    const inId = out.transfer!.counterpartId;

    // Editar la pata de destino actualiza importe y fecha de ambas.
    const patchedIn = await svc.updateTransaction(userA, inId, { amount: 700000, date: "2026-10-27" });
    expect(patchedIn).toMatchObject({ amount: "700000", date: "2026-10-27", transfer: { direction: "in" } });
    const outAfter = await svc.getTransaction(userA.id, out.id);
    expect(outAfter).toMatchObject({ amount: "-700000", date: "2026-10-27" });

    await expect(svc.updateTransaction(userA, out.id, { categoryId: ids.groceries })).rejects.toMatchObject({
      status: 400,
    });
    await expect(svc.updateTransaction(userA, out.id, { accountId: ids.savings })).rejects.toMatchObject({
      status: 400,
    });

    await svc.deleteTransaction(userA.id, out.id);
    const deleted = await db.transaction.findMany({ where: { transferGroupId: out.transferGroupId! } });
    expect(deleted.every((l) => l.deletedAt !== null)).toBe(true);
    await expect(svc.getTransaction(userA.id, inId)).rejects.toMatchObject({ status: 404 });
    const listed = await svc.listTransactions(userA.id, { sort: "date", order: "desc", limit: 50, types: ["TRANSFER"] });
    expect(listed.items).toHaveLength(0);

    const restored = await svc.restoreTransaction(userA.id, inId);
    expect(restored.deletedAt).toBeNull();
    const back = await db.transaction.findMany({ where: { transferGroupId: out.transferGroupId! } });
    expect(back.every((l) => l.deletedAt === null)).toBe(true);
  });

  it("lists with filters, search and cursor pagination", async () => {
    const all = await svc.listTransactions(userA.id, { sort: "date", order: "desc", limit: 200 });
    const dates = all.items.map((t) => t.date);
    expect([...dates].sort().reverse()).toEqual(dates);

    const pages: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await svc.listTransactions(userA.id, { sort: "amount", order: "asc", limit: 2, cursor });
      pages.push(...page.items.map((t) => t.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(new Set(pages).size).toBe(all.items.length);

    const search = await svc.listTransactions(userA.id, { sort: "date", order: "desc", limit: 50, q: "éxito colina" });
    expect(search.items.map((t) => t.description)).toEqual(["ÉXITO COLINA*4821"]);

    const byCategory = await svc.listTransactions(userA.id, {
      sort: "date",
      order: "desc",
      limit: 50,
      categoryIds: [ids.restaurants],
      dateFrom: "2026-10-21",
      dateTo: "2026-10-21",
    });
    expect(byCategory.items).toHaveLength(2);

    const byTag = await svc.listTransactions(userA.id, { sort: "date", order: "desc", limit: 50, tagIds: [ids.tag] });
    expect(byTag.items.map((t) => t.amount)).toEqual(["-30500"]);

    // `q` también busca en el nombre del payee (la descripción de este movimiento está vacía).
    const byPayee = await svc.listTransactions(userA.id, { sort: "date", order: "desc", limit: 50, q: "andinas" });
    expect(byPayee.items.map((t) => t.payee?.name)).toEqual(["Soluciones Andinas S.A.S."]);
  });

  it("collapses transfers to their origin leg and matches the account filter on either leg", async () => {
    const base = { sort: "date" as const, order: "desc" as const, limit: 200, types: ["TRANSFER" as const] };
    const both = await svc.listTransactions(userA.id, base);
    expect(both.items).toHaveLength(2);

    const collapsed = await svc.listTransactions(userA.id, { ...base, collapseTransfers: true });
    expect(collapsed.items).toHaveLength(1);
    expect(collapsed.items[0]).toMatchObject({ transfer: { direction: "out" }, account: { id: ids.checking } });

    // Filtrar por la cuenta destino sigue mostrando la transferencia (por su pata de origen).
    const byDestination = await svc.listTransactions(userA.id, {
      ...base,
      collapseTransfers: true,
      accountIds: [ids.savings],
    });
    expect(byDestination.items.map((t) => t.id)).toEqual([collapsed.items[0].id]);
    const uncollapsedDestination = await svc.listTransactions(userA.id, { ...base, accountIds: [ids.savings] });
    expect(uncollapsedDestination.items[0].transfer?.direction).toBe("in");
  });

  it("scopes everything by userId: another user's ids behave as missing (404)", async () => {
    const mine = await svc.createTransaction(userA, {
      type: "EXPENSE",
      accountId: ids.checking,
      amount: 5000,
      date: "2026-10-22",
      categoryId: null,
    });
    const notFound = { status: 404 };
    await expect(svc.getTransaction(userB.id, mine.id)).rejects.toMatchObject(notFound);
    await expect(svc.updateTransaction(userB, mine.id, { amount: 1 })).rejects.toMatchObject(notFound);
    await expect(svc.deleteTransaction(userB.id, mine.id)).rejects.toMatchObject(notFound);
    await expect(svc.restoreTransaction(userB.id, mine.id)).rejects.toMatchObject(notFound);
    // B no puede usar cuentas, categorías ni etiquetas de A (ni A las de B).
    await expect(
      svc.createTransaction(userB, { type: "EXPENSE", accountId: ids.checking, amount: 1, date: "2026-10-22" }),
    ).rejects.toMatchObject(notFound);
    await expect(
      svc.createTransaction(userB, {
        type: "EXPENSE",
        accountId: ids.bAccount,
        amount: 1,
        date: "2026-10-22",
        categoryId: ids.groceries,
      }),
    ).rejects.toMatchObject(notFound);
    await expect(
      svc.createTransaction(userA, {
        type: "TRANSFER",
        accountId: ids.checking,
        toAccountId: ids.bAccount,
        amount: 1,
        date: "2026-10-22",
      }),
    ).rejects.toMatchObject(notFound);
    expect((await svc.listTransactions(userB.id, { sort: "date", order: "desc", limit: 50 })).items).toHaveLength(0);

    const unchanged = await svc.getTransaction(userA.id, mine.id);
    expect(unchanged.amount).toBe("-5000");
  });
});
