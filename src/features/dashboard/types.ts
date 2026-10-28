// DTO que el endpoint GET /api/v1/dashboard devuelve al cliente.
// Los Decimal de Prisma se convierten a number en el servicio: el dashboard
// sólo muestra agregados y no recalcula sobre ellos.

export type CashflowRange = "monthly" | "quarterly" | "yearly";

export interface SparkPoint {
  date: string; // ISO yyyy-mm-dd
  value: number;
}

// totalBalance.sparkline: saldo al cierre de cada día. monthIncome/monthExpense/
// netSavings.sparkline: suma móvil de 30 días que termina en cada punto.
export interface Kpi {
  value: number;
  previous: number;
  sparkline: SparkPoint[];
}

export interface CashflowBucket {
  label: string; // "Ene", "T1 2026", "2025"
  income: number;
  expense: number; // positivo
  net: number;
}

export interface CategorySlice {
  categoryId: string;
  name: string;
  color: string; // var(--chart-n) o color de la categoría
  amount: number;
}

export interface FinancialHealth {
  netCashflow: number;
  savingsRate: number; // 0..1 (puede ser negativa)
  fixedExpenses: number;
  variableExpenses: number;
  projectedMonthEnd: {
    income: number;
    expense: number;
    net: number;
  };
  daysElapsed: number;
  daysInMonth: number;
}

export interface BudgetStatus {
  budgetId: string;
  categoryName: string;
  limit: number;
  spent: number;
  alertThreshold: number; // 0.8
}

export interface RecentTransaction {
  id: string;
  date: string;
  description: string;
  payee: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  accountName: string;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  amount: number;
  currency: string;
  status: "PENDING" | "CLEARED" | "RECONCILED";
  autoCategorized: boolean; // categoría asignada por una regla (marcador ✦)
}

export interface DashboardData {
  currency: string;
  locale: string;
  month: string; // yyyy-mm al que corresponden los agregados
  kpis: {
    totalBalance: Kpi;
    monthIncome: Kpi;
    monthExpense: Kpi;
    netSavings: Kpi;
  };
  cashflow: Record<CashflowRange, CashflowBucket[]>;
  categories: CategorySlice[];
  health: FinancialHealth;
  budgets: BudgetStatus[];
  recent: RecentTransaction[];
}
