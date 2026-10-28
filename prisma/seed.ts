// Seed del usuario demo: ~6 meses de datos realistas que terminan hoy.
//
// Idempotente: borra todos los datos del usuario demo y los vuelve a crear en
// una sola transacción. Determinista: todo el contenido sale de un PRNG con
// semilla fija (las fechas son relativas a hoy). Ejecutar: `npm run db:seed`.
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

const CURRENCY = "EUR";
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
const monthName = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  timeZone: "UTC",
});

/** Siguiente ocurrencia mensual (día `day`) estrictamente posterior a hoy. */
function nextMonthly(day: number): Date {
  const thisMonth = utc(TY, TM, day);
  return thisMonth > TODAY ? thisMonth : utc(TY, TM + 1, day);
}

// ─── Catálogo: cuentas, categorías, payees, reglas ───────────────────────────

type AccountKey = "checking" | "savings" | "visa" | "cash";

const ACCOUNTS: Record<
  AccountKey,
  {
    name: string;
    type: AccountType;
    initialBalance: number; // céntimos
    creditLimit?: number;
    institution?: string;
    last4?: string;
    color: string;
    icon: string;
  }
> = {
  checking: {
    name: "BBVA Cuenta Online",
    type: "CHECKING",
    initialBalance: 240_000,
    institution: "BBVA",
    last4: "4821",
    color: "chart-1",
    icon: "landmark",
  },
  savings: {
    name: "Ahorro",
    type: "SAVINGS",
    initialBalance: 620_000,
    institution: "BBVA",
    last4: "9034",
    color: "chart-3",
    icon: "piggy-bank",
  },
  visa: {
    name: "Visa BBVA",
    type: "CREDIT_CARD",
    initialBalance: 0,
    creditLimit: 300_000,
    institution: "BBVA",
    last4: "7712",
    color: "chart-5",
    icon: "credit-card",
  },
  cash: {
    name: "Efectivo",
    type: "CASH",
    initialBalance: 12_000,
    color: "chart-4",
    icon: "wallet",
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
      intereses: { name: "Intereses", nature: "VARIABLE", icon: "percent" },
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
      alquiler: { name: "Alquiler", nature: "FIXED", icon: "key-round" },
      suministros: { name: "Suministros", nature: "FIXED", icon: "zap" },
      internet: { name: "Internet y móvil", nature: "FIXED", icon: "wifi" },
    },
  },
  alimentacion: {
    name: "Alimentación",
    kind: "EXPENSE",
    nature: "VARIABLE",
    color: "chart-5",
    icon: "shopping-cart",
    children: {
      supermercado: { name: "Supermercado", nature: "VARIABLE", icon: "shopping-basket" },
      restaurantes: { name: "Restaurantes", nature: "VARIABLE", icon: "utensils" },
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
      taxi: { name: "Taxi y VTC", nature: "VARIABLE", icon: "car-taxi-front" },
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
      farmacia: { name: "Farmacia", nature: "VARIABLE", icon: "pill" },
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
  acme: { name: "Acme Ibérica S.L.", category: "nomina" },
  landlord: { name: "Inmobiliaria Sol", category: "alquiler" },
  iberdrola: { name: "Iberdrola", category: "suministros", rule: "iberdrola" },
  canal: { name: "Canal de Isabel II", category: "suministros", rule: "canal de isabel" },
  movistar: { name: "Movistar", category: "internet", rule: "movistar" },
  netflix: { name: "Netflix", category: "streaming", rule: "netflix" },
  spotify: { name: "Spotify", category: "musica", rule: "spotify" },
  basicfit: { name: "Basic-Fit", category: "gimnasio", rule: "basic-fit" },
  mercadona: { name: "Mercadona", category: "supermercado", rule: "mercadona" },
  lidl: { name: "Lidl", category: "supermercado", rule: "lidl" },
  carrefour: { name: "Carrefour", category: "supermercado", rule: "carrefour" },
  uber: { name: "Uber", category: "taxi", rule: "uber" },
  cabify: { name: "Cabify", category: "taxi", rule: "cabify" },
  metro: { name: "Metro de Madrid", category: "transportePublico", rule: "metro de madrid" },
  renfe: { name: "Renfe", category: "transportePublico", rule: "renfe" },
  glovo: { name: "Glovo", category: "restaurantes", rule: "glovo" },
  tagliatella: { name: "La Tagliatella", category: "restaurantes" },
  barManolo: { name: "Bar Casa Manolo", category: "restaurantes" },
  yelmo: { name: "Yelmo Cines", category: "cine", rule: "yelmo" },
  ticketmaster: { name: "Ticketmaster", category: "cine", rule: "ticketmaster" },
  amazon: { name: "Amazon", category: "compras", rule: "amazon" },
  zara: { name: "Zara", category: "compras" },
  farmacia: { name: "Farmacia Central", category: "farmacia", rule: "farmacia" },
} satisfies Record<string, { name: string; category: CategoryKey; rule?: string }>;

type PayeeKey = keyof typeof PAYEES;

/** Minúsculas, sin acentos ni sufijos societarios ("S.L.", "S.A."). */
function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(s\.?l\.?|s\.?a\.?)$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

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
  cents: number; // con signo, en céntimos
  type: TransactionType;
  category: CategoryKey | null;
  payee: PayeeKey | null;
  description: string;
  transferGroupId: string | null;
  recurringRuleId: string | null;
  ruleOf: PayeeKey | null; // payee cuya regla SYSTEM categorizó la fila
};

const txs: Tx[] = [];
const goalContributions: { transactionId: string; cents: number; date: Date }[] = [];

function add(opts: {
  account: AccountKey;
  date: Date;
  cents: number;
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
    cents: opts.cents,
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
function transfer(from: AccountKey, to: AccountKey, date: Date, cents: number, description: string) {
  if (!inRange(date) || cents <= 0) return null;
  const group = randomUUID();
  const leg = (account: AccountKey, signed: number): Tx => ({
    id: randomUUID(),
    account,
    date,
    cents: signed,
    type: "TRANSFER",
    category: null,
    payee: null,
    description,
    transferGroupId: group,
    recurringRuleId: null,
    ruleOf: null,
  });
  const out = leg(from, -cents);
  const inn = leg(to, cents);
  txs.push(out, inn);
  return { out, inn };
}

const between = (min: number, max: number) => rng.int(min, max);

for (let offset = -6; offset <= 0; offset++) {
  const d = (day: number) => utc(TY, TM + offset, day);
  const monthDate = d(1);
  const isCurrent = offset === 0;

  // Fijos mensuales
  add({ account: "checking", date: d(1), cents: -95_000, payee: "landlord", description: "Alquiler piso", recurringRuleId: recurringId.rent });
  add({ account: "checking", date: d(1), cents: -5_460, payee: "metro", description: "Abono transporte mensual" });
  add({ account: "checking", date: d(2), cents: -3_990, payee: "basicfit", description: "Cuota Basic-Fit" });
  add({ account: "visa", date: d(3), cents: -1_099, payee: "spotify", description: "Spotify Premium" });
  add({ account: "checking", date: d(6), cents: -between(4_800, 9_500), payee: "iberdrola", description: "Factura luz Iberdrola" });
  add({ account: "checking", date: d(10), cents: -5_500, payee: "movistar", description: "Fibra y móvil Movistar" });
  if (monthDate.getUTCMonth() % 2 === 0) {
    add({ account: "checking", date: d(12), cents: -between(2_800, 4_200), payee: "canal", description: "Factura agua Canal de Isabel II" });
  }
  add({ account: "visa", date: d(15), cents: -1_299, payee: "netflix", description: "Netflix", recurringRuleId: recurringId.netflix });
  add({
    account: "checking",
    date: d(27),
    cents: 265_000,
    payee: "acme",
    description: `Nómina ${monthName.format(monthDate)}`,
    recurringRuleId: recurringId.salary,
  });

  // Transferencias mensuales
  transfer("checking", "cash", d(8), 10_000, "Retirada cajero");
  const saving = transfer("checking", "savings", d(28), 40_000, "Ahorro mensual");
  if (saving) goalContributions.push({ transactionId: saving.inn.id, cents: 40_000, date: saving.inn.date });

  // Intereses de la cuenta de ahorro (último día del mes)
  add({ account: "savings", date: d(31), cents: between(300, 700), category: "intereses", description: "Liquidación intereses" });

  // Supermercado
  const groceryDays = [between(1, 6), between(7, 12), between(13, 18), between(19, 24), between(25, 31)];
  for (const day of groceryDays) {
    add({ account: rng.chance(0.7) ? "visa" : "checking", date: d(day), cents: -between(2_500, 8_500), payee: "mercadona" });
  }
  for (let i = 0; i < 2; i++) {
    add({ account: "visa", date: d(between(1, 31)), cents: -between(1_500, 4_500), payee: "lidl" });
  }
  if (rng.chance(0.5)) {
    add({ account: "visa", date: d(between(1, 31)), cents: -between(3_000, 9_000), payee: "carrefour" });
  }

  // Restaurantes
  const meals = between(2, 4);
  for (let i = 0; i < meals; i++) {
    const payee = rng.pick(["tagliatella", "barManolo", "glovo"] as const);
    const account: AccountKey = payee === "barManolo" ? "cash" : "visa";
    add({ account, date: d(between(1, 31)), cents: -between(1_400, 4_500), payee });
  }
  const coffees = between(3, 5);
  for (let i = 0; i < coffees; i++) {
    add({ account: "cash", date: d(between(1, 31)), cents: -between(180, 900), payee: "barManolo", description: "Café y tostada" });
  }

  // Transporte
  const rides = between(1, 3);
  for (let i = 0; i < rides; i++) {
    add({ account: "visa", date: d(between(1, 31)), cents: -between(700, 2_200), payee: rng.chance(0.6) ? "uber" : "cabify" });
  }
  if (rng.chance(0.4)) {
    add({ account: "visa", date: d(between(1, 31)), cents: -between(1_500, 4_500), payee: "renfe", description: "Renfe Cercanías / Media Distancia" });
  }

  // Ocio
  if (rng.chance(0.7)) add({ account: "visa", date: d(between(1, 31)), cents: -between(900, 1_900), payee: "yelmo" });
  const orders = between(1, 2);
  for (let i = 0; i < orders; i++) {
    add({ account: "visa", date: d(between(1, 31)), cents: -between(1_200, 6_000), payee: "amazon", description: "Amazon.es pedido" });
  }
  if (rng.chance(0.4)) add({ account: "visa", date: d(between(1, 31)), cents: -between(2_500, 7_000), payee: "zara" });
  if (rng.chance(0.2)) add({ account: "visa", date: d(between(1, 31)), cents: -between(3_500, 8_000), payee: "ticketmaster", description: "Entradas concierto" });

  // Salud
  if (rng.chance(0.5)) add({ account: rng.chance(0.5) ? "cash" : "visa", date: d(between(1, 31)), cents: -between(500, 2_500), payee: "farmacia" });

  // Ingresos extra
  if (!isCurrent && rng.chance(0.35)) {
    add({ account: "checking", date: d(18), cents: between(30_000, 70_000), category: "freelance", description: "Factura proyecto freelance" });
  }

  // Eventos puntuales
  if (offset === -3) {
    add({ account: "visa", date: d(14), cents: -18_500, category: "viajes", description: "Hotel Valencia (2 noches)" });
    add({ account: "visa", date: d(13), cents: -6_380, payee: "renfe", category: "viajes", description: "Renfe AVE Madrid–Valencia" });
  }
  if (offset === -2) {
    // Devolución: categorizada a mano, no por la regla de Amazon.
    add({ account: "visa", date: d(20), cents: 2_499, payee: "amazon", category: "reembolsos", description: "Devolución Amazon.es" });
  }
}

const byDate = (a: Tx, b: Tx) => a.date.getTime() - b.date.getTime();

// El efectivo no puede quedar en negativo: si no alcanza, se paga con la Visa.
{
  let cash = ACCOUNTS.cash.initialBalance;
  for (const tx of [...txs].sort(byDate)) {
    if (tx.account !== "cash") continue;
    if (tx.cents < 0 && cash + tx.cents < 0) {
      tx.account = "visa";
      continue;
    }
    cash += tx.cents;
  }
}

// Presupuestos (céntimos). Alimentación queda entre el 85 % y el 95 % este mes
// para que el dashboard muestre una alerta al 80 %.
const BUDGETS: { category: ParentKey; cents: number }[] = [
  { category: "alimentacion", cents: 50_000 },
  { category: "transporte", cents: 15_000 },
  { category: "ocio", cents: 25_000 },
  { category: "salud", cents: 6_000 },
];
{
  const food = BUDGETS[0];
  const isFood = (tx: Tx) =>
    tx.date >= CURRENT_MONTH_START && tx.category !== null && (tx.category === food.category || parentOf[tx.category] === food.category);
  const spent = () => -txs.filter(isFood).reduce((s, tx) => s + tx.cents, 0);
  const max = Math.round(food.cents * 0.95);
  const target = Math.round(food.cents * 0.88);
  // Si se pasa, se quitan las compras más recientes del mes.
  while (spent() > max) {
    const latest = txs.filter(isFood).sort(byDate).at(-1)!;
    txs.splice(txs.indexOf(latest), 1);
  }
  if (spent() < Math.round(food.cents * 0.85)) {
    add({ account: "visa", date: new Date(TODAY.getTime() - DAY_MS), cents: -(target - spent()), payee: "mercadona" });
  }
}

// Pago de la Visa: el día 5 se liquida desde la cuenta corriente el saldo
// acumulado hasta fin del mes anterior.
for (let offset = -5; offset <= 0; offset++) {
  const payDay = utc(TY, TM + offset, 5);
  const statementEnd = utc(TY, TM + offset, 1);
  const owed = -txs
    .filter((tx) => tx.account === "visa" && tx.date < statementEnd)
    .reduce((s, tx) => s + tx.cents, 0);
  transfer("checking", "visa", payDay, owed, "Pago tarjeta Visa");
}

txs.sort(byDate);

// ─── Persistencia ────────────────────────────────────────────────────────────

const money = (cents: number) => (cents / 100).toFixed(2);

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
          name: "Lucía Martín",
          baseCurrency: CURRENCY,
          locale: "es-ES",
          timezone: "Europe/Madrid",
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
          normalizedName: normalizeName(p.name),
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
            pattern: p.rule!,
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
            accountId: accountId.checking,
            categoryId: categoryId.nomina,
            name: "Nómina",
            type: "INCOME",
            amount: money(265_000),
            currency: CURRENCY,
            description: "Nómina Acme Ibérica",
            frequency: "MONTHLY",
            dayOfMonth: 27,
            startDate: firstOf(recurringId.salary),
            nextRunAt: nextMonthly(27),
          },
          {
            id: recurringId.rent,
            userId: DEMO_USER_ID,
            accountId: accountId.checking,
            categoryId: categoryId.alquiler,
            name: "Alquiler",
            type: "EXPENSE",
            amount: money(-95_000),
            currency: CURRENCY,
            description: "Alquiler piso",
            frequency: "MONTHLY",
            dayOfMonth: 1,
            startDate: firstOf(recurringId.rent),
            nextRunAt: nextMonthly(1),
          },
          {
            id: recurringId.netflix,
            userId: DEMO_USER_ID,
            accountId: accountId.visa,
            categoryId: categoryId.streaming,
            name: "Netflix",
            type: "EXPENSE",
            amount: money(-1_299),
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
          status: (t.account === "visa" && t.date >= recentCutoff ? "PENDING" : "CLEARED") as TransactionStatus,
          date: t.date,
          amount: money(t.cents),
          currency: CURRENCY,
          amountBase: money(t.cents),
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
          amount: money(b.cents),
          alertThreshold: "0.80",
          startDate: utc(START.getUTCFullYear(), START.getUTCMonth(), 1),
        })),
      });

      await tx.savingsGoal.create({
        data: {
          id: goalId,
          userId: DEMO_USER_ID,
          linkedAccountId: accountId.savings,
          name: "Fondo de emergencia",
          targetAmount: money(1_200_000),
          currency: CURRENCY,
          targetDate: utc(TY + 1, 5, 30),
          monthlyPlan: money(40_000),
          color: "chart-3",
          icon: "shield",
        },
      });
      await tx.goalContribution.createMany({
        data: goalContributions.map((c) => ({
          goalId,
          transactionId: c.transactionId,
          amount: money(c.cents),
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
