// @vitest-environment node
// Tests de servicio contra la BD local real (DATABASE_URL de .env), con dos
// usuarios desechables creados y borrados aquí; nunca toca al usuario demo.
import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("account.service (DB)", async () => {
  const { db } = await import("@/server/db");
  const svc = await import("@/server/services/account.service");

  const userA = { id: randomUUID(), baseCurrency: "COP" };
  const userB = { id: randomUUID(), baseCurrency: "COP" };

  beforeAll(async () => {
    for (const u of [userA, userB]) {
      await db.user.create({
        data: { id: u.id, email: `acc-test-${u.id}@caudal.test`, baseCurrency: "COP", locale: "es-CO" },
      });
    }
  });

  afterAll(async () => {
    const userIds = [userA.id, userB.id];
    await db.transaction.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("creates accounts in the base currency by default, with balances and sort order", async () => {
    const savings = await svc.createAccount(userA, {
      name: "Ahorros test",
      type: "SAVINGS",
      initialBalance: "1500000",
      creditLimit: "999", // ignorado: no es tarjeta
      color: "chart-3",
    });
    expect(savings).toMatchObject({
      name: "Ahorros test",
      currency: "COP",
      balance: 1_500_000,
      initialBalance: 1_500_000,
      creditLimit: null,
      color: "chart-3",
      includeInNetWorth: true,
      archivedAt: null,
      hasTransactions: false,
    });

    const card = await svc.createAccount(userA, {
      name: "Tarjeta test",
      type: "CREDIT_CARD",
      creditLimit: 4_000_000,
      institution: "Nu",
      last4: "4821",
    });
    expect(card).toMatchObject({ creditLimit: 4_000_000, institution: "Nu", last4: "4821", balance: 0 });

    await db.transaction.create({
      data: {
        userId: userA.id,
        accountId: card.id,
        type: "EXPENSE",
        amount: -250_000,
        currency: "COP",
        amountBase: -250_000,
        date: new Date("2026-10-20"),
      },
    });
    const list = await svc.listAccountBalances(userA.id);
    expect(list.map((a) => a.name)).toEqual(["Ahorros test", "Tarjeta test"]);
    expect(list[1]).toMatchObject({ balance: -250_000, hasTransactions: true });

    await expect(svc.createAccount(userA, { name: "x", type: "CASH", initialBalance: "10.5" })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("updates fields but refuses type/currency changes once there are transactions", async () => {
    const [savings, card] = await svc.listAccountBalances(userA.id);

    const renamed = await svc.updateAccount(userA.id, savings!.id, {
      name: "Ahorros renombrada",
      type: "CHECKING",
      currency: "USD",
      initialBalance: "10.5",
      includeInNetWorth: false,
    });
    expect(renamed).toMatchObject({ name: "Ahorros renombrada", type: "CHECKING", currency: "USD", initialBalance: 10.5 });
    expect(renamed.includeInNetWorth).toBe(false);

    await expect(svc.updateAccount(userA.id, card!.id, { type: "SAVINGS" })).rejects.toMatchObject({
      status: 400,
      message: "No se puede cambiar el tipo de una cuenta que ya tiene movimientos.",
    });
    await expect(svc.updateAccount(userA.id, card!.id, { currency: "USD" })).rejects.toMatchObject({ status: 400 });
    // Los borrados también cuentan: podrían restaurarse.
    await db.transaction.updateMany({ where: { accountId: card!.id }, data: { deletedAt: new Date() } });
    await expect(svc.updateAccount(userA.id, card!.id, { currency: "USD" })).rejects.toMatchObject({ status: 400 });

    const relimited = await svc.updateAccount(userA.id, card!.id, { creditLimit: 5_000_000, last4: null });
    expect(relimited).toMatchObject({ creditLimit: 5_000_000, last4: null, balance: 0 });
  });

  it("archives and restores idempotently; archived accounts only appear with includeArchived", async () => {
    const [savings] = await svc.listAccountBalances(userA.id);
    const archived = await svc.archiveAccount(userA.id, savings!.id);
    expect(archived.archivedAt).not.toBeNull();
    const again = await svc.archiveAccount(userA.id, savings!.id);
    expect(again.archivedAt).toBe(archived.archivedAt);

    expect((await svc.listAccountBalances(userA.id)).map((a) => a.id)).not.toContain(savings!.id);
    expect((await svc.listAccountBalances(userA.id, { includeArchived: true })).map((a) => a.id)).toContain(savings!.id);

    const restored = await svc.unarchiveAccount(userA.id, savings!.id);
    expect(restored.archivedAt).toBeNull();
    expect((await svc.unarchiveAccount(userA.id, savings!.id)).archivedAt).toBeNull();
  });

  it("scopes every operation to the user (404 for someone else's account)", async () => {
    const [savings] = await svc.listAccountBalances(userA.id);
    expect(await svc.listAccountBalances(userB.id)).toEqual([]);
    await expect(svc.getAccountBalance(userB.id, savings!.id)).rejects.toMatchObject({ status: 404 });
    await expect(svc.updateAccount(userB.id, savings!.id, { name: "hack" })).rejects.toMatchObject({ status: 404 });
    await expect(svc.archiveAccount(userB.id, savings!.id)).rejects.toMatchObject({ status: 404 });
    await expect(svc.unarchiveAccount(userB.id, savings!.id)).rejects.toMatchObject({ status: 404 });
    expect((await svc.getAccountBalance(userA.id, savings!.id)).name).toBe("Ahorros renombrada");
  });
});
