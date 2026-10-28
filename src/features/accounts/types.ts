import type { AccountColor, AccountType } from "@/features/accounts/schemas";

/**
 * GET /api/v1/accounts: cuenta con su saldo (moneda de la cuenta).
 * Importes como number (agregados; COP enteros, otras monedas ≤ 4 decimales).
 */
export interface AccountDTO {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  /** Token `chart-N` (o null) → `cssColor()`. */
  color: AccountColor | string | null;
  /** initialBalance + Σ amount de los movimientos no borrados. Tarjetas: negativo = deuda. */
  balance: number;
  initialBalance: number;
  /** Sólo CREDIT_CARD. */
  creditLimit: number | null;
  institution: string | null;
  last4: string | null;
  includeInNetWorth: boolean;
  /** ISO; null = activa. Las archivadas sólo salen con `?include=archived`. */
  archivedAt: string | null;
  /** Tiene movimientos (incluidos los borrados): moneda y tipo ya no se pueden cambiar. */
  hasTransactions: boolean;
}
