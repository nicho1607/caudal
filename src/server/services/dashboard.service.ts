import { Prisma } from "@/generated/prisma/client";
import type {
  BudgetStatus,
  CategorySlice,
  DashboardData,
  RecentTransaction,
} from "@/features/dashboard/types";
import { cssColor } from "@/lib/color";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import {
  addDays,
  addMonths,
  balanceSeries,
  bucketCashflow,
  cashflowStartMonth,
  monthContext,
  monthEnd,
  monthStart,
  pendingOccurrences,
  projectMonthEnd,
  rollingSumSeries,
  round2,
  savingsRate,
  todayInTimeZone,
  utcToIso,
  type MonthlyTotals,
} from "@/server/services/dashboard.calc";

const SPARK_POINTS = 30;
const VARIABLE_AVERAGE_DAYS = 90;
const RECENT_LIMIT = 8;
const UNCATEGORIZED = { id: "uncategorized", name: "Sin categoría", color: "var(--muted-foreground)" };

const num = (value: Prisma.Decimal | number | string | null | undefined) =>
  value == null ? 0 : Number(value);

interface DailyRow {
  date: Date;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  fixed: boolean | null;
  recurring: boolean;
  net_worth: boolean;
  total: Prisma.Decimal;
}

interface MonthlyRow {
  month: string;
  type: "INCOME" | "EXPENSE";
  total: Prisma.Decimal;
}

export interface DashboardOptions {
  /** Mes `yyyy-mm`; por defecto el mes en curso en la zona horaria del usuario. */
  month?: string;
  /** Para tests/semillas: "hoy" en `yyyy-mm-dd`. */
  today?: string;
}

/**
 * Agregados del dashboard para un usuario y mes. Importes en moneda base
 * (`amountBase`), transferencias fuera de ingresos/gastos, borrados excluidos.
 */
export async function getDashboard(
  userId: string,
  options: DashboardOptions = {},
): Promise<DashboardData> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { baseCurrency: true, locale: true, timezone: true },
  });
  if (!user) throw new NotFoundError("Usuario no encontrado");

  const today = options.today ?? todayInTimeZone(user.timezone);
  const ctx = monthContext(options.month ?? today.slice(0, 7), today);
  const prevMonth = addMonths(ctx.month, -1);
  const prevEnd = monthEnd(prevMonth);
  const sparkStart = addDays(ctx.refDate, -(SPARK_POINTS - 1));
  const dailyStart = addDays(ctx.refDate, -(VARIABLE_AVERAGE_DAYS - 1));
  const cashflowStart = monthStart(cashflowStartMonth(ctx.month));
  const monthRange = { gte: new Date(ctx.start), lte: new Date(ctx.end) };
  const notDeleted = { userId, deletedAt: null };

  const accounts = await db.account.findMany({
    where: { userId, archivedAt: null, includeInNetWorth: true },
    select: { id: true, initialBalance: true },
  });
  const accountIds = accounts.map((a) => a.id);
  const initialBalance = accounts.reduce((sum, a) => sum + num(a.initialBalance), 0);

  const [
    beforeSpark,
    untilPrevEnd,
    dailyRows,
    monthlyRows,
    categorySums,
    categories,
    budgets,
    recurringRules,
    recentRows,
  ] = await Promise.all([
    db.transaction.aggregate({
      where: { ...notDeleted, accountId: { in: accountIds }, date: { lt: new Date(sparkStart) } },
      _sum: { amountBase: true },
    }),
    db.transaction.aggregate({
      where: { ...notDeleted, accountId: { in: accountIds }, date: { lte: new Date(prevEnd) } },
      _sum: { amountBase: true },
    }),
    db.$queryRaw<DailyRow[]>`
      SELECT t."date",
             t."type"::text AS "type",
             (c."nature" = 'FIXED') AS "fixed",
             (t."recurringRuleId" IS NOT NULL) AS "recurring",
             (a."includeInNetWorth" AND a."archivedAt" IS NULL) AS "net_worth",
             SUM(t."amountBase") AS "total"
      FROM "transactions" t
      JOIN "accounts" a ON a."id" = t."accountId"
      LEFT JOIN "categories" c ON c."id" = t."categoryId"
      WHERE t."userId" = ${userId}::uuid
        AND t."deletedAt" IS NULL
        AND t."date" BETWEEN ${dailyStart}::date AND ${ctx.refDate}::date
      GROUP BY 1, 2, 3, 4, 5`,
    db.$queryRaw<MonthlyRow[]>`
      SELECT to_char(t."date", 'YYYY-MM') AS "month",
             t."type"::text AS "type",
             SUM(t."amountBase") AS "total"
      FROM "transactions" t
      WHERE t."userId" = ${userId}::uuid
        AND t."deletedAt" IS NULL
        AND t."type" <> 'TRANSFER'
        AND t."date" BETWEEN ${cashflowStart}::date AND ${ctx.end}::date
      GROUP BY 1, 2`,
    db.transaction.groupBy({
      by: ["categoryId"],
      where: { ...notDeleted, type: "EXPENSE", date: monthRange },
      _sum: { amountBase: true },
    }),
    db.category.findMany({
      where: { userId },
      select: { id: true, parentId: true, name: true, color: true, nature: true },
    }),
    db.budget.findMany({
      where: {
        userId,
        period: "MONTHLY",
        startDate: { lte: new Date(ctx.end) },
        OR: [{ endDate: null }, { endDate: { gte: new Date(ctx.start) } }],
      },
      orderBy: { startDate: "desc" },
      select: {
        id: true,
        categoryId: true,
        amount: true,
        alertThreshold: true,
        category: { select: { name: true, sortOrder: true } },
      },
    }),
    ctx.isPast
      ? Promise.resolve([])
      : db.recurringRule.findMany({
          where: { userId, isActive: true, type: { in: ["INCOME", "EXPENSE"] } },
          select: {
            type: true,
            amount: true,
            frequency: true,
            interval: true,
            dayOfMonth: true,
            startDate: true,
            endDate: true,
            nextRunAt: true,
          },
        }),
    // Una fila por transferencia: se omite la pata de destino (+) y su cuenta
    // se añade abajo como `counterpartAccountName`.
    db.transaction.findMany({
      where: { ...notDeleted, date: monthRange, NOT: { type: "TRANSFER", amount: { gt: 0 } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: RECENT_LIMIT,
      select: {
        id: true,
        date: true,
        description: true,
        type: true,
        amount: true,
        currency: true,
        status: true,
        autoCategorized: true,
        transferGroupId: true,
        payee: { select: { name: true } },
        category: { select: { name: true, color: true } },
        account: { select: { name: true } },
      },
    }),
  ]);

  // ── Totales mensuales → KPIs del mes y cash flow ──
  const monthlyMap = new Map<string, MonthlyTotals>();
  for (const row of monthlyRows) {
    const entry = monthlyMap.get(row.month) ?? { month: row.month, income: 0, expense: 0 };
    if (row.type === "INCOME") entry.income += num(row.total);
    else entry.expense -= num(row.total);
    monthlyMap.set(row.month, entry);
  }
  const monthly = [...monthlyMap.values()];
  const current = monthlyMap.get(ctx.month) ?? { income: 0, expense: 0 };
  const previous = monthlyMap.get(prevMonth) ?? { income: 0, expense: 0 };

  // ── Series diarias → sparklines, saldo y media variable ──
  const dailyIncome = new Map<string, number>();
  const dailyExpense = new Map<string, number>();
  const dailyNet = new Map<string, number>();
  const dailyBalance = new Map<string, number>();
  let variableExpense = 0;
  const add = (map: Map<string, number>, key: string, value: number) =>
    map.set(key, (map.get(key) ?? 0) + value);

  for (const row of dailyRows) {
    const date = utcToIso(row.date);
    const total = num(row.total);
    if (row.net_worth && date >= sparkStart) add(dailyBalance, date, total);
    if (row.type === "TRANSFER") continue;
    add(dailyNet, date, total);
    if (row.type === "INCOME") add(dailyIncome, date, total);
    else {
      add(dailyExpense, date, -total);
      if (!row.fixed && !row.recurring) variableExpense -= total;
    }
  }

  const balanceSpark = balanceSeries(
    initialBalance + num(beforeSpark._sum.amountBase),
    dailyBalance,
    ctx.refDate,
    SPARK_POINTS,
  );
  const totalBalance = balanceSpark[balanceSpark.length - 1]?.value ?? 0;
  const previousBalance = initialBalance + num(untilPrevEnd._sum.amountBase);

  // ── Categorías: consumo del mes agregado al nivel superior ──
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const spentByCategory = new Map<string, number>();
  const slices = new Map<string, CategorySlice>();
  let fixedExpenses = 0;
  let variableExpenses = 0;

  for (const row of categorySums) {
    const amount = -num(row._sum.amountBase);
    const category = row.categoryId ? categoryById.get(row.categoryId) : undefined;
    if (category?.nature === "FIXED") fixedExpenses += amount;
    else variableExpenses += amount;

    if (category) add(spentByCategory, category.id, amount);
    if (category?.parentId) add(spentByCategory, category.parentId, amount);

    const top = category ? (categoryById.get(category.parentId ?? "") ?? category) : undefined;
    const key = top?.id ?? UNCATEGORIZED.id;
    const slice = slices.get(key) ?? {
      categoryId: key,
      name: top?.name ?? UNCATEGORIZED.name,
      color: cssColor(top?.color) ?? UNCATEGORIZED.color,
      amount: 0,
    };
    slice.amount += amount;
    slices.set(key, slice);
  }

  const categorySlices = [...slices.values()]
    .map((s) => ({ ...s, amount: round2(s.amount) }))
    .filter((s) => s.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  // ── Presupuestos mensuales vigentes (el más reciente por categoría) ──
  const seenBudgetCategories = new Set<string>();
  const budgetStatuses: BudgetStatus[] = [];
  const budgetOrder = new Map<string, number>();
  for (const budget of budgets) {
    if (seenBudgetCategories.has(budget.categoryId)) continue;
    seenBudgetCategories.add(budget.categoryId);
    budgetStatuses.push({
      budgetId: budget.id,
      categoryName: budget.category.name,
      limit: num(budget.amount),
      spent: round2(spentByCategory.get(budget.categoryId) ?? 0),
      alertThreshold: num(budget.alertThreshold),
    });
    budgetOrder.set(budget.id, budget.category.sortOrder);
  }
  budgetStatuses.sort(
    (a, b) =>
      b.spent / b.limit - a.spent / a.limit ||
      (budgetOrder.get(a.budgetId) ?? 0) - (budgetOrder.get(b.budgetId) ?? 0),
  );

  // ── Proyección de fin de mes ──
  let pendingRecurringIncome = 0;
  let pendingRecurringExpense = 0;
  for (const rule of recurringRules) {
    const occurrences = pendingOccurrences(
      {
        frequency: rule.frequency,
        interval: rule.interval,
        dayOfMonth: rule.dayOfMonth,
        startDate: utcToIso(rule.startDate),
        endDate: rule.endDate ? utcToIso(rule.endDate) : null,
        nextRunAt: utcToIso(rule.nextRunAt),
      },
      ctx.start,
      ctx.end,
    ).length;
    const amount = Math.abs(num(rule.amount)) * occurrences;
    if (rule.type === "INCOME") pendingRecurringIncome += amount;
    else pendingRecurringExpense += amount;
  }

  const projection = projectMonthEnd({
    actualIncome: current.income,
    actualExpense: current.expense,
    pendingRecurringIncome,
    pendingRecurringExpense,
    variableDailyAverage: variableExpense / VARIABLE_AVERAGE_DAYS,
    daysRemaining: ctx.daysRemaining,
  });

  const transferGroups = recentRows.map((t) => t.transferGroupId).filter((g): g is string => !!g);
  const destinationLegs = transferGroups.length
    ? await db.transaction.findMany({
        where: { userId, transferGroupId: { in: transferGroups }, amount: { gt: 0 } },
        select: { transferGroupId: true, account: { select: { name: true } } },
      })
    : [];
  const destinationByGroup = new Map(destinationLegs.map((l) => [l.transferGroupId, l.account.name]));

  const recent: RecentTransaction[] = recentRows.map((t) => ({
    id: t.id,
    date: utcToIso(t.date),
    description: t.description ?? t.payee?.name ?? "",
    payee: t.payee?.name ?? null,
    categoryName: t.category?.name ?? null,
    categoryColor: cssColor(t.category?.color),
    accountName: t.account.name,
    type: t.type,
    amount: num(t.amount),
    currency: t.currency,
    status: t.status,
    autoCategorized: t.autoCategorized,
    transferGroupId: t.transferGroupId,
    counterpartAccountName: t.transferGroupId ? (destinationByGroup.get(t.transferGroupId) ?? null) : null,
  }));

  const net = current.income - current.expense;

  return {
    currency: user.baseCurrency,
    locale: user.locale,
    month: ctx.month,
    kpis: {
      totalBalance: {
        value: round2(totalBalance),
        previous: round2(previousBalance),
        sparkline: balanceSpark,
      },
      monthIncome: {
        value: round2(current.income),
        previous: round2(previous.income),
        sparkline: rollingSumSeries(dailyIncome, ctx.refDate, SPARK_POINTS),
      },
      monthExpense: {
        value: round2(current.expense),
        previous: round2(previous.expense),
        sparkline: rollingSumSeries(dailyExpense, ctx.refDate, SPARK_POINTS),
      },
      netSavings: {
        value: round2(net),
        previous: round2(previous.income - previous.expense),
        sparkline: rollingSumSeries(dailyNet, ctx.refDate, SPARK_POINTS),
      },
    },
    cashflow: {
      monthly: bucketCashflow(monthly, "monthly", ctx.month),
      quarterly: bucketCashflow(monthly, "quarterly", ctx.month),
      yearly: bucketCashflow(monthly, "yearly", ctx.month),
    },
    categories: categorySlices,
    health: {
      netCashflow: round2(net),
      savingsRate: savingsRate(current.income, current.expense),
      fixedExpenses: round2(fixedExpenses),
      variableExpenses: round2(variableExpenses),
      projectedMonthEnd: {
        income: round2(projection.income),
        expense: round2(projection.expense),
        net: round2(projection.net),
      },
      daysElapsed: ctx.daysElapsed,
      daysInMonth: ctx.daysInMonth,
    },
    budgets: budgetStatuses,
    recent,
  };
}
