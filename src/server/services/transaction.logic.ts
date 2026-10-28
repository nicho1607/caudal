// Lógica pura de movimientos (sin acceso a BD): signo, precisión por moneda,
// tipo de cambio, patas de transferencia, cursores y mapeo a DTO. La usa
// transaction.service.ts y se testea en tests/unit/transaction-logic.test.ts.
import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import type { TransactionDTO } from "@/features/transactions/types";
import { HttpError } from "@/server/errors";
import { currencyFractionDigits } from "@/lib/format";

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

export const MULTICURRENCY_UNSUPPORTED = "multimoneda aún no soportado";

/**
 * Importe positivo de la API → Decimal, validando los decimales que admite la
 * moneda (COP: pesos enteros; EUR/USD: 2).
 */
export function parseAmount(input: number | string, currency: string): Decimal {
  let value: Decimal;
  try {
    value = new Decimal(input);
  } catch {
    throw new HttpError(400, "Importe no válido");
  }
  if (!value.isFinite() || value.lte(0)) throw new HttpError(400, "El importe debe ser mayor que 0");
  const digits = currencyFractionDigits(currency);
  if (value.decimalPlaces() > digits) {
    throw new HttpError(
      400,
      digits === 0
        ? `Los importes en ${currency} no llevan decimales`
        : `Los importes en ${currency} admiten como máximo ${digits} decimales`,
    );
  }
  return value;
}

/** Signo según el tipo (docs §1/§2): INCOME entra (+), EXPENSE sale (−). */
export function signedAmount(type: "INCOME" | "EXPENSE", positive: Decimal): Decimal {
  const abs = positive.abs();
  return type === "INCOME" ? abs : abs.neg();
}

/**
 * Tipo de cambio cuenta → moneda base. Sin servicio FX todavía: sólo se admite
 * la misma moneda (fxRate 1); otra moneda → 400.
 */
export function resolveFxRate(accountCurrency: string, baseCurrency: string): Decimal {
  if (accountCurrency.trim().toUpperCase() !== baseCurrency.trim().toUpperCase()) {
    throw new HttpError(400, MULTICURRENCY_UNSUPPORTED);
  }
  return new Decimal(1);
}

export interface MoneyFields {
  amount: Decimal;
  currency: string;
  fxRate: Decimal;
  amountBase: Decimal;
}

/** amount con signo + currency de la cuenta + amountBase = amount × fxRate. */
export function moneyFields(amount: Decimal, accountCurrency: string, baseCurrency: string): MoneyFields {
  const fxRate = resolveFxRate(accountCurrency, baseCurrency);
  return { amount, currency: accountCurrency, fxRate, amountBase: amount.mul(fxRate) };
}

export interface TransferAccount {
  id: string;
  currency: string;
}

export interface TransferLeg extends MoneyFields {
  accountId: string;
  transferGroupId: string;
}

/**
 * Las dos patas de una transferencia: origen −amount, destino +amount, mismo
 * transferGroupId. Ambas cuentas deben estar en la moneda base (sin FX aún).
 */
export function buildTransferLegs(
  from: TransferAccount,
  to: TransferAccount,
  positive: Decimal,
  baseCurrency: string,
  transferGroupId: string = randomUUID(),
): [TransferLeg, TransferLeg] {
  if (from.id === to.id) throw new HttpError(400, "Las cuentas de origen y destino deben ser distintas");
  const abs = positive.abs();
  return [
    { accountId: from.id, transferGroupId, ...moneyFields(abs.neg(), from.currency, baseCurrency) },
    { accountId: to.id, transferGroupId, ...moneyFields(abs, to.currency, baseCurrency) },
  ];
}

// ─── Cursor (keyset sobre (clave de orden, id)) ─────────────────────────────

export type TransactionSort = "date" | "amount";

export interface ListCursor {
  sort: TransactionSort;
  /** yyyy-mm-dd para "date"; decimal con signo para "amount". */
  value: string;
  id: string;
}

export function encodeCursor(cursor: ListCursor): string {
  return Buffer.from(JSON.stringify([cursor.sort, cursor.value, cursor.id])).toString("base64url");
}

export function decodeCursor(raw: string, sort: TransactionSort): ListCursor {
  const invalid = () => new HttpError(400, "Cursor no válido");
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw invalid();
  }
  if (!Array.isArray(parsed) || parsed.length !== 3 || !parsed.every((x) => typeof x === "string")) {
    throw invalid();
  }
  const [s, value, id] = parsed as [string, string, string];
  if (s !== sort) throw invalid();
  if (sort === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid();
  if (sort === "amount" && !/^-?\d+(\.\d+)?$/.test(value)) throw invalid();
  return { sort, value, id };
}

/** Escapa comodines de LIKE/ILIKE (`\`, `%`, `_`). */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// ─── DTO ─────────────────────────────────────────────────────────────────────

/** Fila tal como la devuelve Prisma con `transactionInclude`. */
export interface TransactionRow {
  id: string;
  type: TransactionDTO["type"];
  status: TransactionDTO["status"];
  date: Date;
  amount: Decimal;
  amountBase: Decimal;
  currency: string;
  fxRate: Decimal;
  description: string | null;
  notes: string | null;
  autoCategorized: boolean;
  categorizationRuleId: string | null;
  recurringRuleId: string | null;
  transferGroupId: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  account: TransactionDTO["account"];
  category: NonNullable<TransactionDTO["category"]> | null;
  payee: { id: string; name: string } | null;
  tags: { tag: TransactionDTO["tags"][number] }[];
}

export interface CounterpartRow {
  id: string;
  transferGroupId: string | null;
  account: { id: string; name: string };
}

/** Decimal → string decimal exacto sin ceros de relleno ("-217400", "12.5"). */
export function decimalToString(value: Decimal): string {
  return value.toFixed();
}

export function toTransactionDTO(row: TransactionRow, counterpart?: CounterpartRow | null): TransactionDTO {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    date: row.date.toISOString().slice(0, 10),
    amount: decimalToString(row.amount),
    amountBase: decimalToString(row.amountBase),
    currency: row.currency.trim(),
    fxRate: decimalToString(row.fxRate),
    description: row.description,
    notes: row.notes,
    autoCategorized: row.autoCategorized,
    categorizationRuleId: row.categorizationRuleId,
    recurringRuleId: row.recurringRuleId,
    transferGroupId: row.transferGroupId,
    account: { ...row.account, currency: row.account.currency.trim() },
    category: row.category
      ? {
          id: row.category.id,
          name: row.category.name,
          color: row.category.color,
          icon: row.category.icon,
          parentId: row.category.parentId,
        }
      : null,
    payee: row.payee,
    tags: row.tags.map((t) => t.tag),
    transfer:
      row.type === "TRANSFER" && counterpart
        ? {
            counterpartId: counterpart.id,
            counterpartAccount: counterpart.account,
            direction: row.amount.isNegative() ? "out" : "in",
          }
        : null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
