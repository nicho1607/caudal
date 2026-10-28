// Mapeo puro formulario ↔ API de cuentas (tests en tests/unit/account-logic.test.ts).
import {
  ACCOUNT_COLORS,
  parseMoneyInput,
  type AccountColor,
  type AccountFormValues,
  type CreateAccountInput,
  type UpdateAccountInput,
} from "@/features/accounts/schemas";
import type { AccountDTO } from "@/features/accounts/types";

/** Valores iniciales: cuenta existente o una nueva en la moneda base. */
export function toFormValues(account: AccountDTO | null, baseCurrency: string, nextColor?: AccountColor): AccountFormValues {
  if (!account) {
    return {
      name: "",
      type: "SAVINGS",
      institution: "",
      last4: "",
      currency: baseCurrency,
      initialBalance: "",
      creditLimit: "",
      color: nextColor ?? "chart-1",
      includeInNetWorth: true,
    };
  }
  return {
    name: account.name,
    type: account.type,
    institution: account.institution ?? "",
    last4: account.last4 ?? "",
    currency: account.currency,
    initialBalance: account.initialBalance === 0 ? "" : String(account.initialBalance),
    creditLimit: account.creditLimit ? String(account.creditLimit) : "",
    color: isAccountColor(account.color) ? account.color : "chart-6",
    includeInNetWorth: account.includeInNetWorth,
  };
}

export function isAccountColor(color: string | null | undefined): color is AccountColor {
  return !!color && (ACCOUNT_COLORS as readonly string[]).includes(color);
}

/** Primer color que aún no usa ninguna cuenta activa (o rota). */
export function suggestColor(accounts: Pick<AccountDTO, "color" | "archivedAt">[]): AccountColor {
  const used = new Set(accounts.filter((a) => !a.archivedAt).map((a) => a.color));
  return ACCOUNT_COLORS.find((c) => !used.has(c)) ?? ACCOUNT_COLORS[accounts.length % ACCOUNT_COLORS.length]!;
}

/** Formulario → body de POST /api/v1/accounts (valores ya validados por accountFormSchema). */
export function toCreateInput(values: AccountFormValues): CreateAccountInput {
  const currency = values.currency.toUpperCase();
  return {
    name: values.name.trim(),
    type: values.type,
    currency,
    institution: values.institution.trim() || null,
    last4: values.last4.trim() || null,
    initialBalance: values.initialBalance ? (parseMoneyInput(values.initialBalance, currency) ?? "0") : "0",
    creditLimit:
      values.type === "CREDIT_CARD" && values.creditLimit ? parseMoneyInput(values.creditLimit, currency) : null,
    color: values.color,
    includeInNetWorth: values.includeInNetWorth,
  };
}

/** PATCH con sólo los campos cambiados respecto a la cuenta; null si no hay cambios. */
export function toUpdatePayload(values: AccountFormValues, account: AccountDTO): UpdateAccountInput | null {
  const next = toCreateInput(values);
  const patch: UpdateAccountInput = {};
  if (next.name !== account.name) patch.name = next.name;
  if (next.type !== account.type) patch.type = next.type;
  if (next.currency !== account.currency) patch.currency = next.currency;
  if ((next.institution ?? null) !== account.institution) patch.institution = next.institution;
  if ((next.last4 ?? null) !== account.last4) patch.last4 = next.last4;
  if (Number(next.initialBalance) !== account.initialBalance) patch.initialBalance = next.initialBalance;
  const nextLimit = next.creditLimit == null ? null : Number(next.creditLimit);
  if (next.type === "CREDIT_CARD" && nextLimit !== account.creditLimit) patch.creditLimit = next.creditLimit;
  if (next.color !== account.color) patch.color = next.color;
  if (next.includeInNetWorth !== account.includeInNetWorth) patch.includeInNetWorth = next.includeInNetWorth;
  return Object.keys(patch).length > 0 ? patch : null;
}
