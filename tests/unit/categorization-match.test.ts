// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  foldText,
  normalize,
  ruleMatches,
  suggestCategory,
  type MatchablePayee,
  type MatchableRule,
} from "@/server/services/categorization.match";

let seq = 0;
function rule(partial: Partial<MatchableRule> & Pick<MatchableRule, "pattern" | "categoryId">): MatchableRule {
  seq += 1;
  return {
    id: `r${seq}`,
    field: "PAYEE",
    match: "CONTAINS",
    priority: 100,
    source: "USER",
    ...partial,
  };
}

/** Reglas SYSTEM como las de prisma/seed.ts. */
const SYSTEM: MatchableRule[] = [
  ["exito", "mercado"],
  ["d1", "mercado"],
  ["tiendas ara", "mercado"],
  ["rappi", "restaurantes"],
  ["transmilenio", "transporte"],
  ["codensa", "servicios"],
  ["netflix", "streaming"],
  ["juan valdez", "restaurantes"],
].map(([pattern, categoryId]) =>
  rule({ id: `sys-${pattern}`, pattern, categoryId, priority: 1000, source: "SYSTEM" }),
);

describe("normalize", () => {
  it.each([
    ["Éxito", "exito"],
    ["ÉXITO COLINA*4821", "exito colina"],
    ["RAPPI*RESTAURANTE 99881", "rappi restaurante"],
    ["Soluciones Andinas S.A.S.", "soluciones andinas"],
    ["SOLUCIONES ANDINAS SAS", "soluciones andinas"],
    ["Almacenes Éxito S.A.", "almacenes exito"],
    ["Distribuidora Pérez LTDA.", "distribuidora perez"],
    ["Enel Codensa S.A. E.S.P.", "enel codensa"],
    ["Inversiones XYZ S.L.", "inversiones xyz"],
    ["COMPRA EN TIENDAS D1 0234", "tiendas d1"],
    ["PSE ACUEDUCTO DE BOGOTÁ 20261028", "acueducto de bogota"],
    ["PAGO PSE ENEL CODENSA", "enel codensa"],
    ["Juan Valdez Café", "juan valdez cafe"],
    ["Crepes & Waffles", "crepes & waffles"],
    ["  TransMilenio   Recarga  ", "transmilenio recarga"],
    ["Tiendas D1", "tiendas d1"],
    ["Netflix.com", "netflix com"],
  ])("%s → %s", (input, expected) => {
    expect(normalize(input)).toBe(expected);
  });

  it("devuelve vacío para null/undefined/espacios", () => {
    expect(normalize(null)).toBe("");
    expect(normalize(undefined)).toBe("");
    expect(normalize("   ")).toBe("");
  });

  it("no se queda vacío si todo era prefijo o número", () => {
    expect(normalize("PSE")).toBe("pse");
    expect(normalize("12345")).toBe("12345");
  });

  it("es idempotente", () => {
    for (const s of ["ÉXITO COLINA*4821", "Soluciones Andinas S.A.S.", "COMPRA EN TIENDAS D1 0234"]) {
      expect(normalize(normalize(s))).toBe(normalize(s));
    }
  });

  it("foldText no recorta sufijos ni números", () => {
    expect(foldText("Tienda 24 S.A.")).toBe("tienda 24 s a");
  });
});

describe("ruleMatches", () => {
  const input = { payee: "ÉXITO COLINA*4821", description: "Compra semanal mercado" };

  it("CONTAINS / EQUALS / STARTS_WITH sobre el texto normalizado", () => {
    expect(ruleMatches(rule({ pattern: "colina", categoryId: "c" }), input)).toBe(true);
    expect(ruleMatches(rule({ pattern: "exito colina", match: "EQUALS", categoryId: "c" }), input)).toBe(true);
    expect(ruleMatches(rule({ pattern: "exito", match: "EQUALS", categoryId: "c" }), input)).toBe(false);
    expect(ruleMatches(rule({ pattern: "exito", match: "STARTS_WITH", categoryId: "c" }), input)).toBe(true);
    expect(ruleMatches(rule({ pattern: "colina", match: "STARTS_WITH", categoryId: "c" }), input)).toBe(false);
  });

  it("los patrones también se pliegan (acentos y mayúsculas)", () => {
    expect(ruleMatches(rule({ pattern: "ÉXITO", categoryId: "c" }), input)).toBe(true);
  });

  it("DESCRIPTION mira la descripción, no el payee", () => {
    expect(ruleMatches(rule({ field: "DESCRIPTION", pattern: "semanal", categoryId: "c" }), input)).toBe(true);
    expect(ruleMatches(rule({ field: "DESCRIPTION", pattern: "exito", categoryId: "c" }), input)).toBe(false);
  });

  it("PAYEE usa la descripción si no hay payee", () => {
    expect(ruleMatches(rule({ pattern: "rappi", categoryId: "c" }), { description: "Pedido Rappi" })).toBe(true);
  });

  it("REGEX (sin distinguir mayúsculas) sobre el texto normalizado o el original", () => {
    expect(ruleMatches(rule({ match: "REGEX", pattern: "^exito\\b", categoryId: "c" }), input)).toBe(true);
    expect(ruleMatches(rule({ match: "REGEX", pattern: "\\*\\d{4}$", categoryId: "c" }), input)).toBe(true);
    expect(ruleMatches(rule({ match: "REGEX", pattern: "^carulla", categoryId: "c" }), input)).toBe(false);
  });

  it("un REGEX inválido se ignora sin lanzar", () => {
    const bad = rule({ match: "REGEX", pattern: "([a-z", categoryId: "c" });
    expect(() => ruleMatches(bad, input)).not.toThrow();
    expect(ruleMatches(bad, input)).toBe(false);
  });
});

describe("suggestCategory", () => {
  const payees: MatchablePayee[] = [
    { id: "p-crepes", normalizedName: "crepes & waffles", defaultCategoryId: "restaurantes" },
    { id: "p-exito", normalizedName: "exito", defaultCategoryId: "mercado-payee" },
    { id: "p-sin", normalizedName: "falabella", defaultCategoryId: null },
  ];

  it("comercios colombianos caen en su regla SYSTEM", () => {
    expect(suggestCategory({ payee: "ÉXITO COLINA*4821" }, SYSTEM, [])).toEqual({
      categoryId: "mercado",
      ruleId: "sys-exito",
      source: "SYSTEM",
    });
    expect(suggestCategory({ payee: "RAPPI*RESTAURANTE 99881" }, SYSTEM, [])?.ruleId).toBe("sys-rappi");
    expect(suggestCategory({ payee: "COMPRA EN TIENDAS D1 0234" }, SYSTEM, [])?.ruleId).toBe("sys-d1");
    expect(suggestCategory({ payee: "PSE ENEL CODENSA S.A. E.S.P." }, SYSTEM, [])?.ruleId).toBe("sys-codensa");
    expect(suggestCategory({ description: "Recarga TransMilenio 50000" }, SYSTEM, [])?.ruleId).toBe(
      "sys-transmilenio",
    );
  });

  it("sin coincidencias o sin texto → null", () => {
    expect(suggestCategory({ payee: "Ferretería La 14" }, SYSTEM, payees)).toBeNull();
    expect(suggestCategory({ payee: "", description: "  " }, SYSTEM, payees)).toBeNull();
    expect(suggestCategory({}, SYSTEM, payees)).toBeNull();
  });

  it("payee conocido por normalizedName exacto; ignora payees sin categoría", () => {
    expect(suggestCategory({ payee: "CREPES & WAFFLES" }, [], payees)).toEqual({
      categoryId: "restaurantes",
      ruleId: null,
      source: "PAYEE",
    });
    expect(suggestCategory({ payee: "Falabella" }, [], payees)).toBeNull();
  });

  it("orden: USER > payee conocido > LEARNED > SYSTEM", () => {
    const learned = rule({ id: "learned", pattern: "exito", match: "EQUALS", source: "LEARNED", priority: 500, categoryId: "mercado-learned" });
    const user = rule({ id: "user", pattern: "exito", source: "USER", categoryId: "mercado-user" });
    const rules = [...SYSTEM, learned, user];

    expect(suggestCategory({ payee: "Éxito" }, rules, payees)?.source).toBe("USER");
    expect(suggestCategory({ payee: "Éxito" }, [...SYSTEM, learned], payees)?.source).toBe("PAYEE");
    expect(suggestCategory({ payee: "Éxito" }, [...SYSTEM, learned], [])?.ruleId).toBe("learned");
    expect(suggestCategory({ payee: "Éxito" }, SYSTEM, [])?.ruleId).toBe("sys-exito");
  });

  it("el origen pesa más que la prioridad (SYSTEM priority 1 no gana a LEARNED 500)", () => {
    const rules = [
      rule({ id: "sys-low", pattern: "exito", source: "SYSTEM", priority: 1, categoryId: "a" }),
      rule({ id: "learned", pattern: "exito", source: "LEARNED", priority: 500, categoryId: "b" }),
    ];
    expect(suggestCategory({ payee: "Éxito" }, rules, [])?.ruleId).toBe("learned");
  });

  it("dentro del mismo origen gana la menor priority, luego la más antigua", () => {
    const old = new Date("2026-01-01");
    const recent = new Date("2026-06-01");
    const rules = [
      rule({ id: "p200", pattern: "rappi", priority: 200, categoryId: "a" }),
      rule({ id: "p50-new", pattern: "rappi", priority: 50, createdAt: recent, categoryId: "b" }),
      rule({ id: "p50-old", pattern: "rappi", priority: 50, createdAt: old, categoryId: "c" }),
    ];
    expect(suggestCategory({ payee: "Rappi" }, rules, [])?.ruleId).toBe("p50-old");
  });

  it("salta reglas con REGEX inválido y sigue con la siguiente", () => {
    const rules = [
      rule({ id: "bad", match: "REGEX", pattern: "(", priority: 1, categoryId: "x" }),
      rule({ id: "ok", pattern: "netflix", priority: 2, categoryId: "streaming" }),
    ];
    expect(suggestCategory({ payee: "NETFLIX.COM" }, rules, [])?.ruleId).toBe("ok");
  });

  it("no muta las reglas ni los payees de entrada", () => {
    const rules = [...SYSTEM].reverse();
    const snapshot = JSON.stringify(rules);
    const order = rules.map((r) => r.id);
    suggestCategory({ payee: "ÉXITO COLINA*4821" }, rules, payees);
    expect(rules.map((r) => r.id)).toEqual(order);
    expect(JSON.stringify(rules)).toBe(snapshot);
  });
});
