// Cálculos puros de la página de cuentas (agrupación, patrimonio neto, uso de
// tarjetas). Sin imports de servidor; tests en tests/unit/account-logic.test.ts.
import { ACCOUNT_TYPES, type AccountType } from "@/features/accounts/schemas";
import type { AccountDTO } from "@/features/accounts/types";

/** Título de grupo (plural) por tipo, en el orden de la página. */
export const ACCOUNT_GROUP_LABELS: Record<AccountType, string> = {
  SAVINGS: "Ahorros",
  CHECKING: "Corriente",
  CREDIT_CARD: "Tarjetas de crédito",
  CASH: "Efectivo",
  INVESTMENT: "Inversiones",
  LOAN: "Préstamos",
  OTHER: "Otras",
};

/** Nombre del tipo (singular) para el selector del formulario. */
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  SAVINGS: "Cuenta de ahorros",
  CHECKING: "Cuenta corriente",
  CREDIT_CARD: "Tarjeta de crédito",
  CASH: "Efectivo",
  INVESTMENT: "Inversión",
  LOAN: "Préstamo",
  OTHER: "Otra",
};

/** Umbral a partir del cual el uso del cupo se marca como aviso. */
export const CREDIT_WARNING_RATIO = 0.8;

export interface AccountGroup<T extends AccountDTO = AccountDTO> {
  type: AccountType;
  label: string;
  accounts: T[];
  /** Suma de los saldos en la moneda base (las cuentas en otra moneda no suman). */
  subtotal: number;
  /** Hay cuentas en otra moneda que no entran en el subtotal. */
  hasOtherCurrencies: boolean;
}

/** Cuentas activas agrupadas por tipo (orden fijo de ACCOUNT_TYPES), sin grupos vacíos. */
export function groupAccounts<T extends AccountDTO>(accounts: T[], baseCurrency: string): AccountGroup<T>[] {
  return ACCOUNT_TYPES.flatMap((type) => {
    const inGroup = accounts.filter((a) => a.type === type && !a.archivedAt);
    if (inGroup.length === 0) return [];
    const base = inGroup.filter((a) => a.currency === baseCurrency);
    return [
      {
        type,
        label: ACCOUNT_GROUP_LABELS[type],
        accounts: inGroup,
        subtotal: sum(base.map((a) => a.balance)),
        hasOtherCurrencies: base.length < inGroup.length,
      },
    ];
  });
}

export interface NetWorth {
  total: number;
  /** Cuentas activas con includeInNetWorth en otra moneda (no se pueden sumar sin FX). */
  excludedOtherCurrency: number;
}

/**
 * Patrimonio neto: Σ saldos de las cuentas activas con includeInNetWorth en la
 * moneda base. Las tarjetas restan solas (su saldo es negativo cuando hay deuda).
 */
export function netWorth(accounts: AccountDTO[], baseCurrency: string): NetWorth {
  const included = accounts.filter((a) => a.includeInNetWorth && !a.archivedAt);
  return {
    total: sum(included.filter((a) => a.currency === baseCurrency).map((a) => a.balance)),
    excludedOtherCurrency: included.filter((a) => a.currency !== baseCurrency).length,
  };
}

export interface CreditUsage {
  used: number;
  limit: number;
  /** used / limit, sin acotar (puede superar 1). */
  ratio: number;
  warning: boolean;
}

/** Uso del cupo de una tarjeta: deuda = −saldo (0 si el saldo es a favor). null sin cupo. */
export function creditUsage(account: Pick<AccountDTO, "type" | "balance" | "creditLimit">): CreditUsage | null {
  if (account.type !== "CREDIT_CARD" || !account.creditLimit || account.creditLimit <= 0) return null;
  const used = Math.max(0, -account.balance);
  const ratio = used / account.creditLimit;
  return { used, limit: account.creditLimit, ratio, warning: ratio >= CREDIT_WARNING_RATIO };
}

/** Archivadas, la más reciente primero. */
export function archivedAccounts<T extends AccountDTO>(accounts: T[]): T[] {
  return accounts
    .filter((a) => a.archivedAt)
    .sort((a, b) => (a.archivedAt! < b.archivedAt! ? 1 : a.archivedAt! > b.archivedAt! ? -1 : 0));
}

function sum(values: number[]): number {
  // Redondeo a 4 decimales (Decimal(19,4)) para no arrastrar errores de coma flotante.
  return Math.round(values.reduce((acc, v) => acc + v, 0) * 1e4) / 1e4;
}
