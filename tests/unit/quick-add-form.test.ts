import { describe, expect, it } from "vitest";

import { matchTags, quickAddFormSchema, toCreateInput, type QuickAddFormValues } from "@/features/quick-add/form";

const base: QuickAddFormValues = {
  type: "EXPENSE",
  description: "Almuerzo",
  payee: "",
  amount: "18.500",
  date: "2026-10-27",
  accountId: "cash",
  toAccountId: "",
  categoryId: "",
  notes: "",
};

const opts = { currency: "COP", categoryChosen: false, tagIds: [], unknownTags: [] };

describe("quickAddFormSchema", () => {
  const schema = quickAddFormSchema((id) => (id === "eur" ? "EUR" : "COP"));

  it("acepta importes escritos a mano", () => {
    expect(schema.safeParse(base).success).toBe(true);
    expect(schema.safeParse({ ...base, amount: "45k" }).success).toBe(true);
  });

  it("rechaza importes no válidos o negativos", () => {
    expect(schema.safeParse({ ...base, amount: "abc" }).success).toBe(false);
    expect(schema.safeParse({ ...base, amount: "-5000" }).success).toBe(false);
    expect(schema.safeParse({ ...base, amount: "" }).success).toBe(false);
  });

  it("transferencia: destino obligatorio y distinto del origen", () => {
    const t = { ...base, type: "TRANSFER" as const };
    expect(schema.safeParse(t).success).toBe(false);
    expect(schema.safeParse({ ...t, toAccountId: "cash" }).success).toBe(false);
    expect(schema.safeParse({ ...t, toAccountId: "nu" }).success).toBe(true);
  });
});

describe("toCreateInput", () => {
  it("normaliza el importe con la moneda de la cuenta y deja que el servidor categorice", () => {
    expect(toCreateInput(base, opts)).toEqual({
      type: "EXPENSE",
      accountId: "cash",
      amount: "18500",
      date: "2026-10-27",
      description: "Almuerzo",
      notes: null,
      payee: null,
    });
  });

  it("decimales en monedas con centavos", () => {
    expect(toCreateInput({ ...base, amount: "3,50" }, { ...opts, currency: "EUR" }).amount).toBe("3.5");
  });

  it("categoría elegida a mano: id o null explícito", () => {
    expect(toCreateInput({ ...base, categoryId: "cat" }, { ...opts, categoryChosen: true })).toMatchObject({
      categoryId: "cat",
    });
    expect(toCreateInput(base, { ...opts, categoryChosen: true })).toMatchObject({ categoryId: null });
  });

  it("etiquetas: ids existentes y las nuevas como #texto en notas", () => {
    const input = toCreateInput({ ...base, notes: "con Ana" }, { ...opts, tagIds: ["t1"], unknownTags: ["domicilios"] });
    expect(input).toMatchObject({ tagIds: ["t1"], notes: "con Ana #domicilios" });
  });

  it("transferencia sin payee ni categoría", () => {
    const input = toCreateInput(
      { ...base, type: "TRANSFER", toAccountId: "nu", payee: "x", categoryId: "c" },
      { ...opts, categoryChosen: true },
    );
    expect(input).toEqual({
      type: "TRANSFER",
      accountId: "cash",
      toAccountId: "nu",
      amount: "18500",
      date: "2026-10-27",
      description: "Almuerzo",
      notes: null,
    });
  });
});

describe("matchTags", () => {
  it("compara sin tildes ni mayúsculas y no duplica", () => {
    const tags = [
      { id: "t1", name: "Domicilios" },
      { id: "t2", name: "Café" },
    ];
    expect(matchTags(["domicilios", "cafe", "Cafe", "viaje", "Viaje"], tags)).toEqual({
      ids: ["t1", "t2"],
      unknown: ["viaje"],
    });
  });
});
