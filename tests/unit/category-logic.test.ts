import { describe, expect, it } from "vitest";

import { activeTree, archivedTree, testRule, toUpdateCategoryPayload, toUpdateRulePayload, toRuleFormValues } from "@/features/categories/form";
import { regexError, ruleFormSchema } from "@/features/categories/schemas";
import type { CategorizationRuleDTO, CategoryDTO } from "@/features/categories/types";
import {
  assertRulePatchAllowed,
  prepareRulePattern,
  resolveCategoryPlacement,
  resolveRulePattern,
} from "@/server/services/category.logic";

const top = (id: string, kind: "EXPENSE" | "INCOME" = "EXPENSE") => ({ id, kind, parentId: null, archivedAt: null });

describe("resolveCategoryPlacement", () => {
  const base = { hasChildren: false, inUse: false };

  it("al crear, una subcategoría hereda el tipo del padre", () => {
    expect(
      resolveCategoryPlacement({ ...base, current: null, changes: { parentId: "food" }, parent: top("food") }),
    ).toEqual({ kind: "EXPENSE", parentId: "food" });
  });

  it("sin padre ni tipo → 400", () => {
    expect(() => resolveCategoryPlacement({ ...base, current: null, changes: {}, parent: null })).toThrow(
      /gastos o de ingresos/,
    );
  });

  it("máximo dos niveles: el padre no puede ser una subcategoría", () => {
    expect(() =>
      resolveCategoryPlacement({
        ...base,
        current: null,
        changes: { kind: "EXPENSE" },
        parent: { id: "rest", kind: "EXPENSE", parentId: "food", archivedAt: null },
      }),
    ).toThrow(expect.objectContaining({ status: 400, message: expect.stringMatching(/dos niveles/) }));
  });

  it("una categoría con hijas no puede pasar a ser hija", () => {
    expect(() =>
      resolveCategoryPlacement({
        current: { id: "fun", kind: "EXPENSE", parentId: null },
        changes: { parentId: "food" },
        parent: top("food"),
        hasChildren: true,
        inUse: false,
      }),
    ).toThrow(/subcategorías no puede convertirse/);
  });

  it("el padre debe compartir tipo", () => {
    expect(() =>
      resolveCategoryPlacement({ ...base, current: null, changes: { kind: "INCOME" }, parent: top("food") }),
    ).toThrow(/mismo tipo/);
  });

  it("no puede ser su propia madre ni colgar de un padre archivado", () => {
    expect(() =>
      resolveCategoryPlacement({ ...base, current: { id: "a", kind: "EXPENSE", parentId: null }, changes: {}, parent: top("a") }),
    ).toThrow(/propia/);
    expect(() =>
      resolveCategoryPlacement({
        ...base,
        current: null,
        changes: {},
        parent: { ...top("old"), archivedAt: new Date() },
      }),
    ).toThrow(/archivada/);
  });

  it("el tipo no cambia con uso o con subcategorías", () => {
    const current = { id: "x", kind: "EXPENSE" as const, parentId: null };
    expect(() =>
      resolveCategoryPlacement({ current, changes: { kind: "INCOME" }, parent: null, hasChildren: false, inUse: true }),
    ).toThrow(/movimientos o presupuestos/);
    expect(() =>
      resolveCategoryPlacement({ current, changes: { kind: "INCOME" }, parent: null, hasChildren: true, inUse: false }),
    ).toThrow(/con subcategorías/);
    expect(
      resolveCategoryPlacement({ current, changes: { kind: "INCOME" }, parent: null, hasChildren: false, inUse: false }),
    ).toEqual({ kind: "INCOME", parentId: null });
    // Mismo tipo con uso: no es un cambio.
    expect(
      resolveCategoryPlacement({ current, changes: { kind: "EXPENSE" }, parent: null, hasChildren: false, inUse: true }),
    ).toEqual({ kind: "EXPENSE", parentId: null });
  });
});

describe("patrones de regla", () => {
  it("no REGEX → foldText (como la seed y el matcher)", () => {
    expect(prepareRulePattern("CONTAINS", "  Éxito   Colina ")).toBe("exito colina");
    expect(prepareRulePattern("EQUALS", "Crepes & Waffles")).toBe("crepes & waffles");
  });

  it("REGEX se guarda tal cual y se valida (400 en español)", () => {
    expect(prepareRulePattern("REGEX", " ^uber\\s*eats ")).toBe("^uber\\s*eats");
    expect(() => prepareRulePattern("REGEX", "(abc")).toThrow(
      expect.objectContaining({ status: 400, message: expect.stringMatching(/^La expresión regular no es válida/) }),
    );
    expect(regexError("[a-")).toMatch(/no es válida/);
    expect(regexError("^a+$")).toBeNull();
  });

  it("vacío tras normalizar → 400", () => {
    expect(() => prepareRulePattern("CONTAINS", " *** ")).toThrow(/al menos una letra/);
  });

  it("PATCH: re-normaliza sólo si cambian patrón o coincidencia", () => {
    const current = { match: "CONTAINS" as const, pattern: "rappi" };
    expect(resolveRulePattern(current, { priority: 3 })).toBeUndefined();
    expect(resolveRulePattern(current, { pattern: "RAPPI Pay" })).toBe("rappi pay");
    expect(resolveRulePattern(current, { match: "REGEX" })).toBe("rappi");
    expect(() => resolveRulePattern({ match: "CONTAINS", pattern: "(x" }, { match: "REGEX" })).toThrow(/expresión regular/);
  });

  it("SYSTEM: sólo isActive", () => {
    expect(() => assertRulePatchAllowed("SYSTEM", { isActive: false })).not.toThrow();
    expect(() => assertRulePatchAllowed("SYSTEM", { isActive: false, priority: 5 })).toThrow(/sistema/);
    expect(() => assertRulePatchAllowed("LEARNED", { pattern: "x" })).not.toThrow();
  });

  it("el formulario valida REGEX y prioridad", () => {
    const ok = { field: "PAYEE", match: "REGEX", pattern: "^rappi", categoryId: "c", priority: "100", isActive: true };
    expect(ruleFormSchema.safeParse(ok).success).toBe(true);
    expect(ruleFormSchema.safeParse({ ...ok, pattern: "(" }).success).toBe(false);
    expect(ruleFormSchema.safeParse({ ...ok, priority: "0" }).success).toBe(false);
  });
});

describe("prueba en vivo (testRule)", () => {
  it("usa el matcher real sobre el texto normalizado", () => {
    expect(testRule({ field: "PAYEE", match: "CONTAINS", pattern: "Éxito" }, "COMPRA EN ÉXITO COLINA*4821")).toEqual({
      matches: true,
      normalized: "exito colina",
    });
    expect(testRule({ field: "PAYEE", match: "EQUALS", pattern: "exito" }, "Éxito Colina").matches).toBe(false);
    expect(testRule({ field: "PAYEE", match: "STARTS_WITH", pattern: "juan" }, "Juan Valdez Café").matches).toBe(true);
    expect(testRule({ field: "DESCRIPTION", match: "REGEX", pattern: "^pedido\\s+rappi" }, "Pedido Rappi").matches).toBe(true);
  });

  it("sin texto o con REGEX inválido → null", () => {
    expect(testRule({ field: "PAYEE", match: "CONTAINS", pattern: "rappi" }, "  ").matches).toBeNull();
    expect(testRule({ field: "PAYEE", match: "REGEX", pattern: "(" }, "rappi").matches).toBeNull();
  });
});

const cat = (over: Partial<CategoryDTO>): CategoryDTO => ({
  id: "x",
  name: "X",
  kind: "EXPENSE",
  parentId: null,
  color: "chart-1",
  icon: null,
  nature: "VARIABLE",
  sortOrder: 0,
  archivedAt: null,
  inUse: false,
  ...over,
});

describe("árbol y payloads", () => {
  const list = [
    cat({ id: "food", name: "Alimentación" }),
    cat({ id: "market", name: "Mercado", parentId: "food" }),
    cat({ id: "old", name: "Viejo", archivedAt: "2026-10-01T00:00:00Z" }),
    cat({ id: "oldChild", name: "Hija vieja", parentId: "old", archivedAt: "2026-10-01T00:00:00Z" }),
    cat({ id: "orphan", name: "Huérfana", parentId: "old" }),
    cat({ id: "salary", name: "Nómina", kind: "INCOME" }),
  ];

  it("activeTree agrupa por tipo; hijas de un padre archivado van como raíz", () => {
    const tree = activeTree(list, "EXPENSE");
    expect(tree.map((n) => [n.category.id, n.children.map((c) => c.id)])).toEqual([
      ["food", ["market"]],
      ["orphan", []],
    ]);
    expect(activeTree(list, "INCOME").map((n) => n.category.id)).toEqual(["salary"]);
  });

  it("archivedTree anida las archivadas bajo su padre archivado", () => {
    expect(archivedTree(list).map((n) => [n.category.id, n.children.map((c) => c.id)])).toEqual([["old", ["oldChild"]]]);
  });

  it("toUpdateCategoryPayload sólo manda lo cambiado", () => {
    const food = list[0]!;
    const values = { name: "Alimentación", kind: "EXPENSE" as const, parentId: "", nature: "VARIABLE" as const, color: "chart-1" as const, icon: "" };
    expect(toUpdateCategoryPayload(values, food)).toBeNull();
    expect(toUpdateCategoryPayload({ ...values, nature: "FIXED", icon: "utensils" }, food)).toEqual({
      nature: "FIXED",
      icon: "utensils",
    });
  });

  it("toUpdateRulePayload: SYSTEM sólo isActive", () => {
    const rule: CategorizationRuleDTO = {
      id: "r",
      field: "PAYEE",
      match: "CONTAINS",
      pattern: "rappi",
      priority: 1000,
      source: "SYSTEM",
      hitCount: 3,
      lastHitAt: null,
      isActive: true,
      createdAt: "2026-10-01T00:00:00Z",
      category: { id: "c", name: "Restaurantes", kind: "EXPENSE", color: null, icon: null, archived: false },
    };
    const values = toRuleFormValues(rule);
    expect(toUpdateRulePayload(values, rule)).toBeNull();
    expect(toUpdateRulePayload({ ...values, isActive: false, pattern: "otro" }, rule)).toEqual({ isActive: false });
    expect(toUpdateRulePayload({ ...values, pattern: "rappi pay", priority: "50" }, { ...rule, source: "USER" })).toEqual({
      pattern: "rappi pay",
      priority: 50,
    });
  });
});
