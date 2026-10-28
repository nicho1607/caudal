import { describe, expect, it } from "vitest";

import { parseAmountText, parseQuickAdd, type ParseContext } from "@/features/quick-add/parse";

// Miércoles 28/10/2026
const TODAY = "2026-10-28";

const accounts = [
  { id: "banco", name: "Bancolombia Ahorros", type: "SAVINGS" },
  { id: "nu", name: "Nu Ahorros", type: "SAVINGS" },
  { id: "cash", name: "Efectivo", type: "CASH" },
  { id: "tc", name: "Tarjeta Nu", type: "CREDIT_CARD" },
];

const cop: ParseContext = { currency: "COP", today: TODAY, accounts };
const eur: ParseContext = {
  currency: "EUR",
  today: TODAY,
  accounts: [{ id: "visa", name: "Visa BBVA", type: "CREDIT_CARD" }],
};

describe("parseQuickAdd — ejemplos colombianos", () => {
  it("almuerzo 18.500 efectivo ayer", () => {
    expect(parseQuickAdd("almuerzo 18.500 efectivo ayer", cop)).toEqual({
      amount: "18500",
      type: null,
      accountAlias: "efectivo",
      accountId: "cash",
      date: "2026-10-27",
      tags: [],
      payee: null,
      description: "Almuerzo",
    });
  });

  it("rappi 45k tarjeta nu #domicilios", () => {
    const r = parseQuickAdd("rappi 45k tarjeta nu #domicilios", cop);
    expect(r).toMatchObject({
      amount: "45000",
      accountId: "tc",
      accountAlias: "tarjeta nu",
      tags: ["domicilios"],
      description: "Rappi",
      date: null,
      type: null,
    });
  });

  it("+4.500.000 nómina bancolombia → ingreso", () => {
    expect(parseQuickAdd("+4.500.000 nómina bancolombia", cop)).toMatchObject({
      amount: "4500000",
      type: "INCOME",
      accountId: "banco",
      description: "Nómina",
    });
  });

  it("palabras de ingreso sin '+' también marcan INCOME", () => {
    expect(parseQuickAdd("ingreso freelance 1,2M", cop)).toMatchObject({ type: "INCOME", amount: "1200000" });
  });

  it("'-' explícito = gasto", () => {
    expect(parseQuickAdd("-20.000 parqueadero", cop)).toMatchObject({ type: "EXPENSE", amount: "20000" });
  });
});

describe("importes", () => {
  const amount = (text: string, ctx = cop) => parseQuickAdd(text, ctx).amount;

  it.each([
    ["18.500", "18500"],
    ["18500", "18500"],
    ["18,5k", "18500"],
    ["18k", "18000"],
    ["1,2M", "1200000"],
    ["1.2 millones", "1200000"],
    ["18 mil", "18000"],
    ["20 lucas", "20000"],
    ["$ 45.000", "45000"],
    ["$45.000", "45000"],
    ["4.500.000", "4500000"],
    ["18,500", "18500"],
  ])("COP %s → %s", (text, expected) => {
    expect(amount(`compra ${text}`)).toBe(expected);
  });

  it("COP sin centavos: coma con 1–2 cifras se redondea a pesos", () => {
    expect(amount("chicle 3,50")).toBe("4");
  });

  it.each([
    ["3,50", "3.5"],
    ["3.50", "3.5"],
    ["12,05", "12.05"],
    ["1.234,56", "1234.56"],
    ["1.500", "1500"],
    ["2,5k", "2500"],
  ])("EUR %s → %s", (text, expected) => {
    expect(amount(`compra ${text}`, eur)).toBe(expected);
  });

  it("prefiere el importe marcado; si no, el último número", () => {
    expect(amount("2 cervezas 12.000")).toBe("12000");
    expect(amount("$12.000 2 cervezas")).toBe("12000");
  });

  it("no confunde texto con importes", () => {
    expect(amount("tiendas d1")).toBeNull();
    expect(parseAmountText("3x", "COP")).toBeNull();
    expect(parseAmountText("0", "COP")).toBeNull();
  });
});

describe("fechas", () => {
  const date = (text: string) => parseQuickAdd(`taxi 12000 ${text}`, cop).date;

  it("hoy / ayer / anteayer / antier", () => {
    expect(date("hoy")).toBe("2026-10-28");
    expect(date("ayer")).toBe("2026-10-27");
    expect(date("anteayer")).toBe("2026-10-26");
    expect(date("antier")).toBe("2026-10-26");
  });

  it("día de la semana = la última ocurrencia (hoy incluido)", () => {
    expect(date("lunes")).toBe("2026-10-26");
    expect(date("el sábado")).toBe("2026-10-24");
    expect(date("miércoles")).toBe("2026-10-28");
    expect(date("miercoles pasado")).toBe("2026-10-21");
  });

  it("dd/mm del año en curso, o del anterior si sería futura", () => {
    expect(date("15/10")).toBe("2026-10-15");
    expect(date("15/11")).toBe("2025-11-15");
    expect(date("1/2/2025")).toBe("2025-02-01");
    expect(date("31/02")).toBeNull();
  });

  it("la fecha no queda en la descripción", () => {
    expect(parseQuickAdd("taxi el lunes 12000", cop).description).toBe("Taxi");
  });
});

describe("cuentas", () => {
  const account = (text: string) => parseQuickAdd(`mercado 50000 ${text}`, cop).accountId;

  it("alias sin tildes ni mayúsculas", () => {
    expect(account("Bancolombia")).toBe("banco");
    expect(account("BANCOLOMBIA ahorros")).toBe("banco");
    expect(account("nu")).toBe("nu");
    expect(account("tarjeta nu")).toBe("tc");
    expect(account("tarjeta")).toBe("tc");
    expect(account("efectivo")).toBe("cash");
    expect(account("cash")).toBe("cash");
    expect(account("con tarjeta nu")).toBe("tc");
  });

  it("quita la preposición que precede a la cuenta", () => {
    expect(parseQuickAdd("almuerzo 18.500 con tarjeta nu", cop).description).toBe("Almuerzo");
  });

  it("sin coincidencia, la palabra se queda en la descripción", () => {
    const r = parseQuickAdd("café 3,50 visa ayer #trabajo", { ...eur, accounts: [] });
    expect(r).toMatchObject({ accountId: null, amount: "3.5", description: "Café visa", tags: ["trabajo"] });
  });

  it("ejemplo del PRD con cuenta Visa", () => {
    expect(parseQuickAdd("café 3,50 visa ayer #trabajo", eur)).toEqual({
      amount: "3.5",
      type: null,
      accountAlias: "visa",
      accountId: "visa",
      date: "2026-10-27",
      tags: ["trabajo"],
      payee: null,
      description: "Café",
    });
  });
});

describe("etiquetas y descripción", () => {
  it("varias etiquetas, sin duplicados", () => {
    expect(parseQuickAdd("cine 30000 #ocio #Ocio #con-amigos", cop).tags).toEqual(["ocio", "Ocio", "con-amigos"]);
  });

  it("texto vacío", () => {
    expect(parseQuickAdd("   ", cop)).toEqual({
      amount: null,
      type: null,
      accountAlias: null,
      accountId: null,
      date: null,
      tags: [],
      payee: null,
      description: "",
    });
  });
});

describe("comercio conocido al inicio", () => {
  const merchants = ["Rappi", "Juan Valdez", "Éxito", "Uber", "Uber eats"];
  const ctx: ParseContext = { ...cop, merchants };

  it("rappi 45k tarjeta nu → Comercio Rappi (la descripción se mantiene)", () => {
    expect(parseQuickAdd("rappi 45k tarjeta nu", ctx)).toMatchObject({
      payee: "Rappi",
      description: "Rappi",
      amount: "45000",
      accountId: "tc",
    });
  });

  it("varias palabras, tildes y mayúsculas; gana el comercio más largo", () => {
    expect(parseQuickAdd("JUAN VALDEZ tinto 9.000", ctx).payee).toBe("Juan Valdez");
    expect(parseQuickAdd("exito mercado 120k", ctx).payee).toBe("Éxito");
    expect(parseQuickAdd("uber eats 32.000", ctx).payee).toBe("Uber eats");
    expect(parseQuickAdd("uber 18.000 ayer", ctx).payee).toBe("Uber");
  });

  it("sólo si el texto empieza por el comercio", () => {
    expect(parseQuickAdd("almuerzo rappi 45k", ctx).payee).toBeNull();
    expect(parseQuickAdd("rappitendero 10k", ctx).payee).toBeNull();
    expect(parseQuickAdd("rappi 45k", cop).payee).toBeNull();
  });

  it("el importe o la fecha delante no impiden reconocerlo", () => {
    expect(parseQuickAdd("45k rappi tarjeta nu", ctx).payee).toBe("Rappi");
    expect(parseQuickAdd("ayer juan valdez 9000", ctx).payee).toBe("Juan Valdez");
  });
});
