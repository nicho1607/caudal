// Reglas puras de cuentas (sin BD): decimales por moneda, cupo sólo en
// tarjetas y qué no se puede cambiar cuando ya hay movimientos.
// Tests en tests/unit/account-logic.test.ts.
import { Prisma } from "@/generated/prisma/client";

import type { AccountType } from "@/features/accounts/schemas";
import { currencyFractionDigits } from "@/lib/format";
import { HttpError } from "@/server/errors";

const Decimal = Prisma.Decimal;
type Decimal = Prisma.Decimal;

/** Importe de cuenta (saldo inicial o cupo) validado contra los decimales de la moneda. */
export function parseAccountMoney(input: number | string, currency: string, label: string): Decimal {
  let value: Decimal;
  try {
    value = new Decimal(input);
  } catch {
    throw new HttpError(400, `${label}: importe no válido`);
  }
  if (!value.isFinite()) throw new HttpError(400, `${label}: importe no válido`);
  const digits = currencyFractionDigits(currency);
  if (value.decimalPlaces() > digits) {
    throw new HttpError(
      400,
      digits === 0
        ? `${label}: los importes en ${currency} no llevan decimales`
        : `${label}: los importes en ${currency} admiten como máximo ${digits} decimales`,
    );
  }
  return value;
}

export interface AccountState {
  type: AccountType;
  currency: string;
  initialBalance: Decimal;
  creditLimit: Decimal | null;
}

export interface AccountChanges {
  type?: AccountType;
  currency?: string;
  initialBalance?: number | string;
  creditLimit?: number | string | null;
}

/**
 * Estado final de los campos con reglas tras aplicar `changes` a `current`
 * (null al crear). Lanza 400 si cambian tipo/moneda con movimientos o si un
 * importe no cuadra con la moneda final. El cupo sólo existe en CREDIT_CARD.
 */
export function resolveAccountState(
  current: AccountState | null,
  changes: AccountChanges,
  hasTransactions: boolean,
): AccountState {
  if (current && hasTransactions) {
    if (changes.type !== undefined && changes.type !== current.type) {
      throw new HttpError(400, "No se puede cambiar el tipo de una cuenta que ya tiene movimientos.");
    }
    if (changes.currency !== undefined && changes.currency !== current.currency) {
      throw new HttpError(400, "No se puede cambiar la moneda de una cuenta que ya tiene movimientos.");
    }
  }
  const type = changes.type ?? current?.type;
  const currency = changes.currency ?? current?.currency;
  if (!type || !currency) throw new HttpError(400, "Faltan el tipo o la moneda de la cuenta");

  const initialBalance =
    changes.initialBalance !== undefined
      ? parseAccountMoney(changes.initialBalance, currency, "Saldo inicial")
      : current
        ? parseAccountMoney(current.initialBalance.toFixed(), currency, "Saldo inicial")
        : new Decimal(0);

  let creditLimit: Decimal | null = null;
  if (type === "CREDIT_CARD") {
    const raw = changes.creditLimit !== undefined ? changes.creditLimit : (current?.creditLimit?.toFixed() ?? null);
    if (raw !== null) {
      creditLimit = parseAccountMoney(raw, currency, "Cupo");
      if (creditLimit.lte(0)) throw new HttpError(400, "El cupo debe ser mayor que 0");
    }
  }

  return { type, currency, initialBalance, creditLimit };
}
