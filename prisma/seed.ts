// Seed del usuario demo: ~6 meses de datos realistas que terminan hoy.
//
// Idempotente: borra todos los datos del usuario demo y los vuelve a crear en
// una sola transacción. Determinista: todo el contenido sale de un PRNG con
// semilla fija (las fechas son relativas a hoy). Ejecutar: `npm run db:seed`.
//
// Usuario en Colombia: pesos (COP, sin centavos), es-CO, America/Bogota.
// Cuentas: Bancolombia Ahorros (nómina y gasto diario), Nu Ahorros (meta de
// ahorro), Efectivo y Tarjeta Nu.
import "dotenv/config";

import { randomUUID } from "node:crypto";

import type {
  AccountType,
  CategoryKind,
  CostNature,
  Prisma,
  TransactionStatus,
  TransactionType,
} from "../src/generated/prisma/client";
import { createRng } from "../src/lib/prng";
import { db } from "../src/server/db";
import { DEMO_USER_EMAIL, DEMO_USER_ID } from "../src/server/demo-user";
import { foldText, normalize } from "../src/server/services/categorization.match";

const CURRENCY = "COP";
const LOCALE = "es-CO";
const TIMEZONE = "America/Bogota";
const rng = createRng(20261028);

// ─── Fechas (columnas @db.Date → medianoche UTC) ─────────────────────────────

const DAY_MS = 86_400_000;

/** Fecha UTC; normaliza el mes y recorta el día al último del mes. */
function utc(year: number, month: number, day: number): Date {
  const first = new Date(Date.UTC(year, month, 1));
  const y = first.getUTCFullYear();
  const m = first.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(day, daysInMonth)));
}

const now = new Date();
const TODAY = utc(now.getFullYear(), now.getMonth(), now.getDate());
const TY = TODAY.getUTCFullYear();
const TM = TODAY.getUTCMonth();
const START = utc(TY, TM - 6, TODAY.getUTCDate());
const CURRENT_MONTH_START = utc(TY, TM, 1);

const inRange = (d: Date) => d >= START && d <= TODAY;
const monthName = new Intl.DateTimeFormat(LOCALE, {
  month: "long",
  timeZone: "UTC",
});

/** Siguiente ocurrencia mensual (día `day`) estrictamente posterior a hoy. */
function nextMonthly(day: number): Date {
  const thisMonth = utc(TY, TM, day);
  return thisMonth > TODAY ? thisMonth : utc(TY, TM + 1, day);
}

// La nómina cae el 25; si hoy es antes del 25, la del mes en curso se adelanta
// a hoy para que el dashboard muestre siempre un mes con ingresos.
const PAYDAY = 25;
const SALARY = 4_500_000;
const RENT = 1_400_000;
const NETFLIX = 26_900;
const MONTHLY_SAVING = 600_000;
const ATM_WITHDRAWAL = 350_000;

// ─── Catálogo: cuentas, categorías, payees, reglas ───────────────────────────

type AccountKey = "bancolombia" | "nu" | "card" | "cash";

/** Importes en pesos enteros (COP no usa centavos). */
const ACCOUNTS: Record<
  AccountKey,
  {
    name: string;
    type: AccountType;
    initialBalance: number;
    creditLimit?: number;
    institution?: string;
    last4?: string;
    color: string;
    icon: string;
  }
> = {
  bancolombia: {
    name: "Bancolombia Ahorros",
    type: "SAVINGS",
    initialBalance: 3_800_000,
    institution: "Bancolombia",
    last4: "4821",
    color: "chart-1",
    icon: "landmark",
  },
  nu: {
    name: "Nu Ahorros",
    type: "SAVINGS",
    initialBalance: 6_000_000,
    institution: "Nu",
    last4: "9034",
    color: "chart-3",
    icon: "piggy-bank",
  },
  cash: {
    name: "Efectivo",
    type: "CASH",
    initialBalance: 150_000,
    color: "chart-4",
    icon: "wallet",
  },
  card: {
    name: "Tarjeta Nu",
    type: "CREDIT_CARD",
    initialBalance: 0,
    creditLimit: 4_000_000,
    institution: "Nu",
    last4: "7712",
    color: "chart-5",
    icon: "credit-card",
  },
};

type CategoryDef = {
  name: string;
  kind: CategoryKind;
  nature: CostNature;
  color: string;
  icon: string;
  children: Record<string, { name: string; nature: CostNature; icon: string }>;
};

const CATEGORIES = {
  trabajo: {
    name: "Trabajo",
    kind: "INCOME",
    nature: "FIXED",
    color: "chart-3",
    icon: "briefcase",
    children: {
      nomina: { name: "Nómina", nature: "FIXED", icon: "banknote" },
      freelance: { name: "Freelance", nature: "VARIABLE", icon: "laptop" },
    },
  },
  otrosIngresos: {
    name: "Otros ingresos",
    kind: "INCOME",
    nature: "VARIABLE",
    color: "chart-2",
    icon: "coins",
    children: {
      rendimientos: { name: "Rendimientos", nature: "VARIABLE", icon: "percent" },
      reembolsos: { name: "Reembolsos", nature: "VARIABLE", icon: "undo-2" },
    },
  },
  vivienda: {
    name: "Vivienda",
    kind: "EXPENSE",
    nature: "FIXED",
    color: "chart-1",
    icon: "house",
    children: {
      arriendo: { name: "Arriendo", nature: "FIXED", icon: "key-round" },
      servicios: { name: "Servicios públicos", nature: "FIXED", icon: "zap" },
      internet: { name: "Internet y celular", nature: "FIXED", icon: "wifi" },
    },
  },
  alimentacion: {
    name: "Alimentación",
    kind: "EXPENSE",
    nature: "VARIABLE",
    color: "chart-5",
    icon: "shopping-cart",
    children: {
      mercado: { name: "Mercado", nature: "VARIABLE", icon: "shopping-basket" },
      restaurantes: { name: "Restaurantes y domicilios", nature: "VARIABLE", icon: "utensils" },
    },
  },
  transporte: {
    name: "Transporte",
    kind: "EXPENSE",
    nature: "VARIABLE",
    color: "chart-2",
    icon: "bus",
    children: {
      transportePublico: { name: "Transporte público", nature: "FIXED", icon: "train-front" },
      taxi: { name: "Taxi y apps", nature: "VARIABLE", icon: "car-taxi-front" },
    },
  },
  suscripciones: {
    name: "Suscripciones",
    kind: "EXPENSE",
    nature: "FIXED",
    color: "chart-4",
    icon: "repeat",
    children: {
      streaming: { name: "Streaming", nature: "FIXED", icon: "tv" },
      musica: { name: "Música", nature: "FIXED", icon: "music" },
      gimnasio: { name: "Gimnasio", nature: "FIXED", icon: "dumbbell" },
    },
  },
  ocio: {
    name: "Ocio",
    kind: "EXPENSE",
    nature: "VARIABLE",
    color: "chart-3",
    icon: "party-popper",
    children: {
      cine: { name: "Cine y eventos", nature: "VARIABLE", icon: "clapperboard" },
      compras: { name: "Compras", nature: "VARIABLE", icon: "shopping-bag" },
      viajes: { name: "Viajes", nature: "VARIABLE", icon: "plane" },
    },
  },
  salud: {
    name: "Salud",
    kind: "EXPENSE",
    nature: "VARIABLE",
    color: "chart-6",
    icon: "heart-pulse",
    children: {
      drogueria: { name: "Droguería", nature: "VARIABLE", icon: "pill" },
    },
  },
} satisfies Record<string, CategoryDef>;

type ParentKey = keyof typeof CATEGORIES;
type ChildKey = {
  [P in ParentKey]: keyof (typeof CATEGORIES)[P]["children"];
}[ParentKey];
type CategoryKey = ParentKey | ChildKey;

/** `rule`: patrón (normalizado) de la regla SYSTEM; omitido = sin regla. */
const PAYEES = {
  employer: { name: "Soluciones Andinas S.A.S.", category: "nomina" },
  landlord: { name: "Inmobiliaria Los Cerros", category: "arriendo" },
  codensa: { name: "Enel Codensa", category: "servicios", rule: "codensa" },
  vanti: { name: "Vanti", category: "servicios", rule: "vanti" },
  acueducto: { name: "Acueducto de Bogotá", category: "servicios", rule: "acueducto" },
  claro: { name: "Claro", category: "internet", rule: "claro" },
  movistar: { name: "Movistar", category: "internet", rule: "movistar" },
  netflix: { name: "Netflix", category: "streaming", rule: "netflix" },
  spotify: { name: "Spotify", category: "musica", rule: "spotify" },
  smartfit: { name: "Smart Fit", category: "gimnasio", rule: "smart fit" },
  exito: { name: "Éxito", category: "mercado", rule: "exito" },
  carulla: { name: "Carulla", category: "mercado", rule: "carulla" },
  d1: { name: "Tiendas D1", category: "mercado", rule: "d1" },
  ara: { name: "Tiendas Ara", category: "mercado", rule: "tiendas ara" },
  rappi: { name: "Rappi", category: "restaurantes", rule: "rappi" },
  crepes: { name: "Crepes & Waffles", category: "restaurantes" },
  corrientazo: { name: "Restaurante El Buen Sabor", category: "restaurantes" },
  juanValdez: { name: "Juan Valdez Café", category: "restaurantes", rule: "juan valdez" },
  uber: { name: "Uber", category: "taxi", rule: "uber" },
  didi: { name: "DiDi", category: "taxi", rule: "didi" },
  transmilenio: { name: "TransMilenio", category: "transportePublico", rule: "transmilenio" },
  cineColombia: { name: "Cine Colombia", category: "cine", rule: "cine colombia" },
  tuboleta: { name: "Tuboleta", category: "cine", rule: "tuboleta" },
  mercadoLibre: { name: "Mercado Libre", category: "compras", rule: "mercado libre" },
  falabella: { name: "Falabella", category: "compras" },
  farmatodo: { name: "Farmatodo", category: "drogueria", rule: "farmatodo" },
} satisfies Record<string, { name: string; category: CategoryKey; rule?: string }>;

type PayeeKey = keyof typeof PAYEES;

// ─── Ids (generados aquí para poder enlazar filas antes de insertarlas) ──────

const accountId = Object.fromEntries(
  Object.keys(ACCOUNTS).map((k) => [k, randomUUID()]),
) as Record<AccountKey, string>;

const categoryId = {} as Record<CategoryKey, string>;
const categoryKind = {} as Record<CategoryKey, CategoryKind>;
const parentOf = {} as Record<CategoryKey, ParentKey | null>;
for (const [pKey, parent] of Object.entries(CATEGORIES) as [ParentKey, CategoryDef][]) {
  categoryId[pKey] = randomUUID();
  categoryKind[pKey] = parent.kind;
  parentOf[pKey] = null;
  for (const cKey of Object.keys(parent.children) as ChildKey[]) {
    categoryId[cKey] = randomUUID();
    categoryKind[cKey] = parent.kind;
    parentOf[cKey] = pKey;
  }
}

const payeeId = Object.fromEntries(
  Object.keys(PAYEES).map((k) => [k, randomUUID()]),
) as Record<PayeeKey, string>;

const ruleId = {} as Partial<Record<PayeeKey, string>>;
for (const [key, payee] of Object.entries(PAYEES) as [PayeeKey, { rule?: string }][]) {
  if (payee.rule) ruleId[key] = randomUUID();
}

const recurringId = {
  salary: randomUUID(),
  rent: randomUUID(),
  netflix: randomUUID(),
};
const goalId = randomUUID();

// ─── Generación de transacciones ─────────────────────────────────────────────

type Tx = {
  id: string;
  account: AccountKey;
  date: Date;
  amount: number; // con signo, en pesos enteros
  type: TransactionType;
  category: CategoryKey | null;
  payee: PayeeKey | null;
  description: string;
  transferGroupId: string | null;
  recurringRuleId: string | null;
  ruleOf: PayeeKey | null; // payee cuya regla SYSTEM categorizó la fila
};

const txs: Tx[] = [];
const goalContributions: { transactionId: string; amount: number; date: Date }[] = [];

function add(opts: {
  account: AccountKey;
  date: Date;
  amount: number;
  payee?: PayeeKey;
  category?: CategoryKey; // explícita = categorización manual
  description?: string;
  recurringRuleId?: string;
}): Tx | null {
  if (!inRange(opts.date)) return null;
  const payee = opts.payee ?? null;
  let category = opts.category ?? null;
  let ruleOf: PayeeKey | null = null;
  if (!category && payee) {
    category = PAYEES[payee].category;
    if (ruleId[payee]) ruleOf = payee;
  }
  if (!category) throw new Error(`Transacción sin categoría: ${opts.description}`);
  const tx: Tx = {
    id: randomUUID(),
    account: opts.account,
    date: opts.date,
    amount: opts.amount,
    type: categoryKind[category] === "INCOME" ? "INCOME" : "EXPENSE",
    category,
    payee,
    description: opts.description ?? (payee ? PAYEES[payee].name : ""),
    transferGroupId: null,
    recurringRuleId: opts.recurringRuleId ?? null,
    ruleOf,
  };
  txs.push(tx);
  return tx;
}

/** Transferencia = dos patas con el mismo transferGroupId que suman cero. */
function transfer(from: AccountKey, to: AccountKey, date: Date, amount: number, description: string) {
  if (!inRange(date) || amount <= 0) return null;
  const group = randomUUID();
  const leg = (account: AccountKey, signed: number): Tx => ({
    id: randomUUID(),
    account,
    date,
    amount: signed,
    type: "TRANSFER",
    category: null,
    payee: null,
    description,
    transferGroupId: group,
    recurringRuleId: null,
    ruleOf: null,
  });
  const out = leg(from, -amount);
  const inn = leg(to, amount);
  txs.push(out, inn);
  return { out, inn };
}

/** Entero aleatorio en [min, max] redondeado a `step` pesos (precios reales). */
const between = (min: number, max: number, step = 100) => Math.round(rng.int(min, max) / step) * step;

for (let offset = -6; offset <= 0; offset++) {
  const d = (day: number) => utc(TY, TM + offset, day);
  const monthDate = d(1);
  const isCurrent = offset === 0;

  // Fijos mensuales (Bancolombia salvo suscripciones en la Tarjeta Nu)
  add({ account: "bancolombia", date: d(1), amount: -RENT, payee: "landlord", description: "Arriendo apartamento", recurringRuleId: recurringId.rent });
  add({ account: "bancolombia", date: d(2), amount: -89_900, payee: "smartfit", description: "Mensualidad Smart Fit" });
  add({ account: "card", date: d(3), amount: -16_900, payee: "spotify", description: "Spotify Premium" });
  add({ account: "bancolombia", date: d(6), amount: -between(95_000, 165_000), payee: "codensa", description: "Factura energía Enel Codensa" });
  add({ account: "bancolombia", date: d(9), amount: -between(32_000, 68_000), payee: "vanti", description: "Factura gas Vanti" });
  add({ account: "bancolombia", date: d(10), amount: -95_900, payee: "claro", description: "Internet hogar Claro" });
  add({ account: "bancolombia", date: d(12), amount: -55_000, payee: "movistar", description: "Plan celular Movistar" });
  if (monthDate.getUTCMonth() % 2 === 0) {
    add({ account: "bancolombia", date: d(14), amount: -between(85_000, 145_000), payee: "acueducto", description: "Factura agua Acueducto de Bogotá" });
  }
  add({ account: "card", date: d(15), amount: -NETFLIX, payee: "netflix", description: "Netflix", recurringRuleId: recurringId.netflix });
  const payday = isCurrent && TODAY < d(PAYDAY) ? TODAY : d(PAYDAY);
  add({
    account: "bancolombia",
    date: payday,
    amount: SALARY,
    payee: "employer",
    description: `Nómina ${monthName.format(monthDate)}`,
    recurringRuleId: recurringId.salary,
  });

  // Transferencias mensuales
  transfer("bancolombia", "cash", d(8), ATM_WITHDRAWAL, "Retiro cajero Bancolombia");
  const saving = transfer("bancolombia", "nu", d(PAYDAY + 1), MONTHLY_SAVING, "Ahorro mensual a Nu");
  if (saving) goalContributions.push({ transactionId: saving.inn.id, amount: MONTHLY_SAVING, date: saving.inn.date });

  // Rendimientos de Nu Ahorros (último día del mes)
  add({ account: "nu", date: d(31), amount: between(38_000, 62_000, 1), category: "rendimientos", description: "Rendimientos Nu" });

  // Mercado
  const bigShops = [between(1, 7, 1), between(8, 15, 1), between(16, 23, 1), between(24, 31, 1)];
  for (const day of bigShops) {
    add({ account: rng.chance(0.7) ? "card" : "bancolombia", date: d(day), amount: -between(110_000, 290_000), payee: rng.chance(0.6) ? "exito" : "carulla" });
  }
  for (let i = 0; i < 3; i++) {
    add({ account: rng.chance(0.5) ? "cash" : "bancolombia", date: d(between(1, 31, 1)), amount: -between(25_000, 85_000), payee: rng.chance(0.6) ? "d1" : "ara" });
  }

  // Restaurantes y domicilios
  const deliveries = between(2, 3, 1);
  for (let i = 0; i < deliveries; i++) {
    add({ account: "card", date: d(between(1, 31, 1)), amount: -between(32_000, 72_000), payee: "rappi", description: "Pedido Rappi" });
  }
  if (rng.chance(0.6)) add({ account: "card", date: d(between(1, 31, 1)), amount: -between(65_000, 130_000), payee: "crepes" });
  const lunches = between(4, 6, 1);
  for (let i = 0; i < lunches; i++) {
    add({ account: "cash", date: d(between(1, 31, 1)), amount: -between(15_000, 22_000), payee: "corrientazo", description: "Almuerzo corrientazo" });
  }
  const coffees = between(2, 4, 1);
  for (let i = 0; i < coffees; i++) {
    add({ account: "card", date: d(between(1, 31, 1)), amount: -between(8_000, 18_000), payee: "juanValdez" });
  }

  // Transporte
  const topUps = between(3, 4, 1);
  for (let i = 0; i < topUps; i++) {
    add({ account: "cash", date: d(between(1, 31, 1)), amount: -between(30_000, 50_000, 10_000), payee: "transmilenio", description: "Recarga tarjeta TransMilenio" });
  }
  const rides = between(1, 3, 1);
  for (let i = 0; i < rides; i++) {
    add({ account: "card", date: d(between(1, 31, 1)), amount: -between(12_000, 35_000), payee: rng.chance(0.6) ? "uber" : "didi" });
  }

  // Ocio
  if (rng.chance(0.7)) add({ account: "card", date: d(between(1, 31, 1)), amount: -between(24_000, 56_000), payee: "cineColombia" });
  const orders = between(1, 2, 1);
  for (let i = 0; i < orders; i++) {
    add({ account: "card", date: d(between(1, 31, 1)), amount: -between(45_000, 180_000), payee: "mercadoLibre", description: "Compra Mercado Libre" });
  }
  if (rng.chance(0.35)) add({ account: "card", date: d(between(1, 31, 1)), amount: -between(90_000, 260_000), payee: "falabella" });
  if (rng.chance(0.2)) add({ account: "card", date: d(between(1, 31, 1)), amount: -between(150_000, 320_000), payee: "tuboleta", description: "Boletas concierto Tuboleta" });

  // Salud
  if (rng.chance(0.5)) add({ account: rng.chance(0.5) ? "cash" : "card", date: d(between(1, 31, 1)), amount: -between(18_000, 85_000), payee: "farmatodo" });

  // Ingresos extra
  if (!isCurrent && rng.chance(0.35)) {
    add({ account: "bancolombia", date: d(18), amount: between(700_000, 1_600_000, 10_000), category: "freelance", description: "Cuenta de cobro proyecto freelance" });
  }

  // Eventos puntuales
  if (offset === -3) {
    add({ account: "card", date: d(13), amount: -486_000, category: "viajes", description: "Avianca Bogotá–Cartagena" });
    add({ account: "card", date: d(14), amount: -720_000, category: "viajes", description: "Hotel Cartagena (2 noches)" });
  }
  if (offset === -2) {
    // Devolución: categorizada a mano, no por la regla de Mercado Libre.
    add({ account: "card", date: d(20), amount: 89_900, payee: "mercadoLibre", category: "reembolsos", description: "Devolución Mercado Libre" });
  }
}

const byDate = (a: Tx, b: Tx) => a.date.getTime() - b.date.getTime();

// El efectivo no puede quedar en negativo: si no alcanza, se paga con la Tarjeta Nu.
{
  let cash = ACCOUNTS.cash.initialBalance;
  for (const tx of [...txs].sort(byDate)) {
    if (tx.account !== "cash") continue;
    if (tx.amount < 0 && cash + tx.amount < 0) {
      tx.account = "card";
      continue;
    }
    cash += tx.amount;
  }
}

// Presupuestos (pesos). Alimentación queda entre el 85 % y el 95 % este mes
// para que el dashboard muestre una alerta al 80 %.
const BUDGETS: { category: ParentKey; amount: number }[] = [
  { category: "alimentacion", amount: 1_500_000 },
  { category: "transporte", amount: 400_000 },
  { category: "ocio", amount: 600_000 },
  { category: "salud", amount: 150_000 },
];
{
  const food = BUDGETS[0];
  const isFood = (tx: Tx) =>
    tx.date >= CURRENT_MONTH_START && tx.category !== null && (tx.category === food.category || parentOf[tx.category] === food.category);
  const spent = () => -txs.filter(isFood).reduce((s, tx) => s + tx.amount, 0);
  const max = Math.round(food.amount * 0.95);
  const target = Math.round(food.amount * 0.88);
  // Si se pasa, se quitan las compras más recientes del mes.
  while (spent() > max) {
    const latest = txs.filter(isFood).sort(byDate).at(-1)!;
    txs.splice(txs.indexOf(latest), 1);
  }
  if (spent() < Math.round(food.amount * 0.85)) {
    add({ account: "card", date: new Date(TODAY.getTime() - DAY_MS), amount: -(target - spent()), payee: "exito" });
  }
}

// Pago de la Tarjeta Nu: el día 5 se paga desde Bancolombia el saldo
// acumulado hasta fin del mes anterior.
for (let offset = -5; offset <= 0; offset++) {
  const payDay = utc(TY, TM + offset, 5);
  const statementEnd = utc(TY, TM + offset, 1);
  const owed = -txs
    .filter((tx) => tx.account === "card" && tx.date < statementEnd)
    .reduce((s, tx) => s + tx.amount, 0);
  transfer("bancolombia", "card", payDay, owed, "Pago Tarjeta Nu");
}

txs.sort(byDate);

// Invariante: Bancolombia y Efectivo nunca quedan en negativo (por día, con
// los ingresos del día antes que los gastos).
for (const key of ["bancolombia", "cash"] as const) {
  let balance = ACCOUNTS[key].initialBalance;
  const own = txs.filter((tx) => tx.account === key);
  for (const [i, tx] of own.entries()) {
    balance += tx.amount;
    const endOfDay = i === own.length - 1 || own[i + 1].date.getTime() !== tx.date.getTime();
    if (endOfDay && balance < 0) {
      throw new Error(`Saldo negativo en ${ACCOUNTS[key].name} el ${tx.date.toISOString().slice(0, 10)}: ${balance}`);
    }
  }
}

// ─── Persistencia ────────────────────────────────────────────────────────────

/** Decimal como string; COP en pesos enteros. */
const money = (pesos: number) => {
  if (!Number.isInteger(pesos)) throw new Error(`Importe con decimales: ${pesos}`);
  return String(pesos);
};

async function main() {
  const recentCutoff = new Date(TODAY.getTime() - DAY_MS);

  const ruleHits = new Map<PayeeKey, { count: number; last: Date }>();
  for (const tx of txs) {
    if (!tx.ruleOf) continue;
    const hit = ruleHits.get(tx.ruleOf) ?? { count: 0, last: tx.date };
    hit.count += 1;
    if (tx.date > hit.last) hit.last = tx.date;
    ruleHits.set(tx.ruleOf, hit);
  }

  const firstOf = (rid: string) => txs.find((tx) => tx.recurringRuleId === rid)?.date ?? START;

  await db.$transaction(
    async (tx) => {
      // Transactions.account es onDelete: Restrict → borrar transacciones antes
      // que el usuario (el resto cae en cascada).
      await tx.transaction.deleteMany({ where: { userId: DEMO_USER_ID } });
      await tx.user.deleteMany({ where: { OR: [{ id: DEMO_USER_ID }, { email: DEMO_USER_EMAIL }] } });

      await tx.user.create({
        data: {
          id: DEMO_USER_ID,
          email: DEMO_USER_EMAIL,
          name: "Camila Restrepo",
          baseCurrency: CURRENCY,
          locale: LOCALE,
          timezone: TIMEZONE,
          weekStartsOn: 1,
        },
      });

      await tx.account.createMany({
        data: (Object.entries(ACCOUNTS) as [AccountKey, (typeof ACCOUNTS)[AccountKey]][]).map(([key, a], i) => ({
          id: accountId[key],
          userId: DEMO_USER_ID,
          name: a.name,
          type: a.type,
          currency: CURRENCY,
          initialBalance: money(a.initialBalance),
          creditLimit: a.creditLimit === undefined ? null : money(a.creditLimit),
          institution: a.institution ?? null,
          last4: a.last4 ?? null,
          color: a.color,
          icon: a.icon,
          sortOrder: i,
        })),
      });

      const parents: Prisma.CategoryCreateManyInput[] = [];
      const children: Prisma.CategoryCreateManyInput[] = [];
      (Object.entries(CATEGORIES) as [ParentKey, CategoryDef][]).forEach(([pKey, p], i) => {
        parents.push({
          id: categoryId[pKey],
          userId: DEMO_USER_ID,
          name: p.name,
          kind: p.kind,
          nature: p.nature,
          color: p.color,
          icon: p.icon,
          sortOrder: i,
        });
        Object.entries(p.children).forEach(([cKey, c], j) => {
          children.push({
            id: categoryId[cKey as ChildKey],
            userId: DEMO_USER_ID,
            parentId: categoryId[pKey],
            name: c.name,
            kind: p.kind,
            nature: c.nature,
            color: p.color,
            icon: c.icon,
            sortOrder: j,
          });
        });
      });
      await tx.category.createMany({ data: parents });
      await tx.category.createMany({ data: children });

      await tx.payee.createMany({
        data: (Object.entries(PAYEES) as [PayeeKey, (typeof PAYEES)[PayeeKey]][]).map(([key, p]) => ({
          id: payeeId[key],
          userId: DEMO_USER_ID,
          name: p.name,
          normalizedName: normalize(p.name),
          defaultCategoryId: categoryId[p.category],
        })),
      });

      await tx.categorizationRule.createMany({
        data: (Object.entries(PAYEES) as [PayeeKey, { category: CategoryKey; rule?: string }][])
          .filter(([, p]) => p.rule)
          .map(([key, p]) => ({
            id: ruleId[key]!,
            userId: DEMO_USER_ID,
            categoryId: categoryId[p.category],
            field: "PAYEE" as const,
            match: "CONTAINS" as const,
            pattern: foldText(p.rule!),
            priority: 1000,
            source: "SYSTEM" as const,
            hitCount: ruleHits.get(key)?.count ?? 0,
            lastHitAt: ruleHits.get(key)?.last ?? null,
          })),
      });

      await tx.recurringRule.createMany({
        data: [
          {
            id: recurringId.salary,
            userId: DEMO_USER_ID,
            accountId: accountId.bancolombia,
            categoryId: categoryId.nomina,
            name: "Nómina",
            type: "INCOME",
            amount: money(SALARY),
            currency: CURRENCY,
            description: "Nómina Soluciones Andinas",
            frequency: "MONTHLY",
            dayOfMonth: PAYDAY,
            startDate: firstOf(recurringId.salary),
            nextRunAt: nextMonthly(PAYDAY),
          },
          {
            id: recurringId.rent,
            userId: DEMO_USER_ID,
            accountId: accountId.bancolombia,
            categoryId: categoryId.arriendo,
            name: "Arriendo",
            type: "EXPENSE",
            amount: money(-RENT),
            currency: CURRENCY,
            description: "Arriendo apartamento",
            frequency: "MONTHLY",
            dayOfMonth: 1,
            startDate: firstOf(recurringId.rent),
            nextRunAt: nextMonthly(1),
          },
          {
            id: recurringId.netflix,
            userId: DEMO_USER_ID,
            accountId: accountId.card,
            categoryId: categoryId.streaming,
            name: "Netflix",
            type: "EXPENSE",
            amount: money(-NETFLIX),
            currency: CURRENCY,
            description: "Netflix",
            frequency: "MONTHLY",
            dayOfMonth: 15,
            startDate: firstOf(recurringId.netflix),
            nextRunAt: nextMonthly(15),
          },
        ],
      });

      await tx.transaction.createMany({
        data: txs.map((t) => ({
          id: t.id,
          userId: DEMO_USER_ID,
          accountId: accountId[t.account],
          categoryId: t.category ? categoryId[t.category] : null,
          payeeId: t.payee ? payeeId[t.payee] : null,
          recurringRuleId: t.recurringRuleId,
          transferGroupId: t.transferGroupId,
          type: t.type,
          status: (t.account === "card" && t.date >= recentCutoff ? "PENDING" : "CLEARED") as TransactionStatus,
          date: t.date,
          amount: money(t.amount),
          currency: CURRENCY,
          amountBase: money(t.amount),
          fxRate: "1",
          description: t.description,
          autoCategorized: t.ruleOf !== null,
          categorizationRuleId: t.ruleOf ? ruleId[t.ruleOf]! : null,
        })),
      });

      await tx.budget.createMany({
        data: BUDGETS.map((b) => ({
          userId: DEMO_USER_ID,
          categoryId: categoryId[b.category],
          period: "MONTHLY" as const,
          amount: money(b.amount),
          alertThreshold: "0.80",
          startDate: utc(START.getUTCFullYear(), START.getUTCMonth(), 1),
        })),
      });

      await tx.savingsGoal.create({
        data: {
          id: goalId,
          userId: DEMO_USER_ID,
          linkedAccountId: accountId.nu,
          name: "Fondo de emergencia",
          targetAmount: money(15_000_000),
          currency: CURRENCY,
          targetDate: utc(TY + 1, 11, 31),
          monthlyPlan: money(MONTHLY_SAVING),
          color: "chart-3",
          icon: "shield",
        },
      });
      await tx.goalContribution.createMany({
        data: goalContributions.map((c) => ({
          goalId,
          transactionId: c.transactionId,
          amount: money(c.amount),
          date: c.date,
          note: "Ahorro mensual",
        })),
      });
    },
    { timeout: 60_000 },
  );

  console.log(
    `Seed OK · usuario demo ${DEMO_USER_ID} · ${txs.length} transacciones ` +
      `(${START.toISOString().slice(0, 10)} → ${TODAY.toISOString().slice(0, 10)})`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
