// @vitest-environment node
// Tests de servicio contra la BD local real (DATABASE_URL de .env), con dos
// usuarios desechables creados y borrados aquí; nunca toca al usuario demo.
import "dotenv/config";

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)("category + categorization-rule services (DB)", async () => {
  const { db } = await import("@/server/db");
  const categories = await import("@/server/services/category.service");
  const rules = await import("@/server/services/categorization-rule.service");
  const { suggest } = await import("@/server/services/categorization.service");

  const userA = randomUUID();
  const userB = randomUUID();
  let accountId = "";

  beforeAll(async () => {
    for (const id of [userA, userB]) {
      await db.user.create({ data: { id, email: `cat-test-${id}@caudal.test`, baseCurrency: "COP", locale: "es-CO" } });
    }
    const account = await db.account.create({
      data: { userId: userA, name: "Ahorros", type: "SAVINGS", currency: "COP" },
    });
    accountId = account.id;
  });

  afterAll(async () => {
    const userIds = [userA, userB];
    await db.transaction.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("crea principal + subcategoría (tipo heredado, orden, dos niveles, nombres únicos)", async () => {
    const food = await categories.createCategory(userA, { name: "Alimentación", kind: "EXPENSE", color: "chart-2", icon: "shopping-cart" });
    expect(food).toMatchObject({ kind: "EXPENSE", parentId: null, nature: "VARIABLE", color: "chart-2", inUse: false, archivedAt: null });

    const market = await categories.createCategory(userA, { name: "Mercado", parentId: food.id, nature: "FIXED" });
    expect(market).toMatchObject({ kind: "EXPENSE", parentId: food.id, nature: "FIXED", sortOrder: 1 });
    const second = await categories.createCategory(userA, { name: "Domicilios", parentId: food.id });
    expect(second.sortOrder).toBe(2);

    await expect(categories.createCategory(userA, { name: "Nivel 3", parentId: market.id })).rejects.toMatchObject({ status: 400 });
    await expect(categories.createCategory(userA, { name: "mercado", parentId: food.id })).rejects.toMatchObject({ status: 409 });
    await expect(categories.createCategory(userA, { name: "ALIMENTACIÓN", kind: "EXPENSE" })).rejects.toMatchObject({ status: 409 });
    await expect(categories.createCategory(userA, { name: "Sueldo", kind: "INCOME", parentId: food.id })).rejects.toMatchObject({
      status: 400,
    });
    // Padre de otro usuario → 404
    await expect(categories.createCategory(userB, { name: "X", parentId: food.id })).rejects.toMatchObject({ status: 404 });

    const list = await categories.listCategories(userA);
    expect(list.map((c) => c.name)).toEqual(["Alimentación", "Mercado", "Domicilios"]);
  });

  it("el tipo se bloquea con movimientos; mover bajo otro padre del mismo tipo", async () => {
    const fun = await categories.createCategory(userA, { name: "Ocio", kind: "EXPENSE" });
    const income = await categories.createCategory(userA, { name: "Ingresos varios", kind: "INCOME" });
    const flipped = await categories.updateCategory(userA, income.id, { kind: "EXPENSE" });
    expect(flipped.kind).toBe("EXPENSE");
    await categories.updateCategory(userA, income.id, { kind: "INCOME" });

    await db.transaction.create({
      data: { userId: userA, accountId, type: "EXPENSE", amount: -1000, currency: "COP", amountBase: -1000, date: new Date("2026-10-20"), categoryId: fun.id },
    });
    await expect(categories.updateCategory(userA, fun.id, { kind: "INCOME" })).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/tipo/),
    });
    expect((await categories.getCategory(userA, fun.id)).inUse).toBe(true);

    const food = (await categories.listCategories(userA)).find((c) => c.name === "Alimentación")!;
    // Con hijas no puede pasar a ser hija
    await expect(categories.updateCategory(userA, food.id, { parentId: fun.id })).rejects.toMatchObject({ status: 400 });
    const moved = await categories.updateCategory(userA, fun.id, { parentId: food.id, name: "Salidas" });
    expect(moved).toMatchObject({ parentId: food.id, name: "Salidas" });
    await expect(categories.updateCategory(userA, income.id, { parentId: food.id })).rejects.toMatchObject({ status: 400 });
    await expect(categories.updateCategory(userB, fun.id, { name: "x" })).rejects.toMatchObject({ status: 404 });
  });

  it("archivar se lleva las hijas; restaurar el padre las devuelve; nada se borra", async () => {
    const food = (await categories.listCategories(userA)).find((c) => c.name === "Alimentación")!;
    const archived = await categories.archiveCategory(userA, food.id);
    expect(archived.archivedAt).not.toBeNull();
    expect((await categories.listCategories(userA)).some((c) => c.parentId === food.id || c.id === food.id)).toBe(false);
    const all = await categories.listCategories(userA, { includeArchived: true });
    const children = all.filter((c) => c.parentId === food.id);
    expect(children.length).toBe(3);
    expect(children.every((c) => c.archivedAt === archived.archivedAt)).toBe(true);

    // Hija con padre archivado → 400
    await expect(categories.unarchiveCategory(userA, children[0]!.id)).rejects.toMatchObject({ status: 400 });
    // Idempotente
    await categories.archiveCategory(userA, food.id);

    await categories.unarchiveCategory(userA, food.id);
    const restored = await categories.listCategories(userA);
    expect(restored.filter((c) => c.parentId === food.id).length).toBe(3);
    expect(await db.category.count({ where: { userId: userA } })).toBe(5);
  });

  it("reglas: patrón normalizado, REGEX validado, SYSTEM sólo isActive, categoría archivada fuera del matching", async () => {
    const all = await categories.listCategories(userA);
    const market = all.find((c) => c.name === "Mercado")!;
    const outings = all.find((c) => c.name === "Salidas")!;

    const rule = await rules.createRule(userA, { pattern: "  Éxito  Colina ", categoryId: market.id });
    expect(rule).toMatchObject({ pattern: "exito colina", field: "PAYEE", match: "CONTAINS", priority: 100, source: "USER", isActive: true, hitCount: 0 });
    expect(rule.category).toMatchObject({ id: market.id, name: "Mercado", archived: false });

    await expect(rules.createRule(userA, { pattern: "(rappi", match: "REGEX", categoryId: market.id })).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/expresión regular no es válida/),
    });
    await expect(rules.createRule(userB, { pattern: "x", categoryId: market.id })).rejects.toMatchObject({ status: 404 });

    const regex = await rules.createRule(userA, { pattern: "^cine\\s+\\w+", match: "REGEX", field: "DESCRIPTION", categoryId: outings.id, priority: 50 });
    expect(regex.pattern).toBe("^cine\\s+\\w+");
    const edited = await rules.updateRule(userA, regex.id, { match: "CONTAINS", pattern: "Cine Colombia" });
    expect(edited).toMatchObject({ match: "CONTAINS", pattern: "cine colombia" });
    await expect(rules.updateRule(userA, regex.id, { match: "REGEX", pattern: "[" })).rejects.toMatchObject({ status: 400 });

    const system = await db.categorizationRule.create({
      data: { userId: userA, categoryId: market.id, pattern: "d1", source: "SYSTEM", priority: 1000 },
    });
    await expect(rules.updateRule(userA, system.id, { pattern: "ara" })).rejects.toMatchObject({ status: 400 });
    expect(await rules.updateRule(userA, system.id, { isActive: false })).toMatchObject({ isActive: false, pattern: "d1" });
    expect(await rules.updateRule(userA, system.id, { isActive: true })).toMatchObject({ isActive: true });

    const list = await rules.listRules(userA);
    expect(list.map((r) => r.source)).toEqual(["USER", "USER", "SYSTEM"]);
    expect(list[0]!.priority).toBe(50);

    expect(await suggest(userA, { payee: "ÉXITO COLINA*4821" })).toMatchObject({ categoryId: market.id, ruleId: rule.id });
    await categories.archiveCategory(userA, market.id);
    expect(await suggest(userA, { payee: "ÉXITO COLINA*4821" })).toBeNull();
    await expect(rules.createRule(userA, { pattern: "ara", categoryId: market.id })).rejects.toMatchObject({ status: 400 });
    await categories.unarchiveCategory(userA, market.id);
  });
});
