// Esquemas zod de cuentas, compartidos por el formulario (react-hook-form +
// zodResolver) y los Route Handlers de /api/v1/accounts. Sin imports de
// servidor: este módulo también se importa desde el cliente.
import { z } from "zod";

import { currencyFractionDigits } from "@/lib/format";

export const ACCOUNT_TYPES = ["SAVINGS", "CHECKING", "CREDIT_CARD", "CASH", "INVESTMENT", "LOAN", "OTHER"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Colores de cuenta: se guardan como token del tema (`chart-3`) → `cssColor()`. */
export const ACCOUNT_COLORS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6"] as const;
export type AccountColor = (typeof ACCOUNT_COLORS)[number];

/** Importe máximo que cabe en Decimal(19,4). */
const MAX_AMOUNT = 1e15;

const decimalString = /^-?\d+(\.\d+)?$/;

/** Saldo con signo (número o string decimal "-1500.5"); los decimales se validan en el servidor por moneda. */
export const signedMoneySchema = z
  .union([z.number().finite(), z.string().trim().regex(decimalString, "Importe no válido")])
  .refine((v) => Math.abs(Number(v)) < MAX_AMOUNT, "Importe demasiado grande");

/** Cupo de tarjeta: positivo. */
export const positiveMoneySchema = signedMoneySchema.refine((v) => Number(v) > 0, "El cupo debe ser mayor que 0");

export const currencySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{3}$/, "Moneda no válida (código ISO de 3 letras)")
  .transform((v) => v.toUpperCase());

const optionalText = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`).nullish();

const accountFields = {
  name: z.string().trim().min(1, "Ponle un nombre a la cuenta").max(60, "Máximo 60 caracteres"),
  type: z.enum(ACCOUNT_TYPES),
  /** Ausente al crear = moneda base del usuario. */
  currency: currencySchema.optional(),
  institution: optionalText(60),
  last4: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Deben ser 4 dígitos")
    .nullish(),
  initialBalance: signedMoneySchema.optional(),
  /** Sólo para CREDIT_CARD; en otros tipos el servidor lo deja en null. */
  creditLimit: positiveMoneySchema.nullish(),
  color: z.enum(ACCOUNT_COLORS).nullish(),
  includeInNetWorth: z.boolean().optional(),
};

export const createAccountSchema = z.strictObject(accountFields);

export const updateAccountSchema = z
  .strictObject({ ...accountFields, name: accountFields.name.optional(), type: accountFields.type.optional() })
  .refine((v) => Object.keys(v).length > 0, "No hay cambios que guardar");

export const listAccountsQuerySchema = z.object({
  /** `include=archived` → también las archivadas (página de cuentas). */
  include: z.literal("archived").optional(),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

// ─── Formulario (Sheet) ─────────────────────────────────────────────────────

/** Valores del formulario: strings para los inputs; "" = vacío. */
export const accountFormSchema = z
  .object({
    name: accountFields.name,
    type: z.enum(ACCOUNT_TYPES),
    institution: z.string().trim().max(60, "Máximo 60 caracteres"),
    last4: z
      .string()
      .trim()
      .regex(/^(\d{4})?$/, "Deben ser 4 dígitos"),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/, "Elige una moneda"),
    initialBalance: z.string().trim(),
    creditLimit: z.string().trim(),
    color: z.enum(ACCOUNT_COLORS),
    includeInNetWorth: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.initialBalance && parseMoneyInput(values.initialBalance, values.currency) === null) {
      ctx.addIssue({ code: "custom", path: ["initialBalance"], message: "Importe no válido" });
    }
    if (values.type === "CREDIT_CARD" && values.creditLimit) {
      const limit = parseMoneyInput(values.creditLimit, values.currency);
      if (limit === null || limit.startsWith("-") || Number(limit) === 0) {
        ctx.addIssue({ code: "custom", path: ["creditLimit"], message: "El cupo debe ser un importe mayor que 0" });
      }
    }
  });

export type AccountFormValues = z.infer<typeof accountFormSchema>;

/**
 * Importe escrito por el usuario → string decimal canónico ("-1500000", "12.5")
 * o null si no es válido. Acepta "$", espacios, signo y separadores de miles:
 * en monedas sin decimales (COP) "." y "," son siempre miles ("1.500.000");
 * en las demás, el último separador seguido de 1–2 cifras es el decimal
 * ("1.234,56", "1,234.56", "12,5").
 */
export function parseMoneyInput(value: string, currency: string): string | null {
  let s = value.replace(/[\s $]/g, "").replace(/−/g, "-");
  let sign = "";
  if (s.startsWith("-")) {
    sign = "-";
    s = s.slice(1);
  }
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const zeroDecimals = currencyFractionDigits(currency) === 0;
  let int = s;
  let frac = "";
  const decimal = /[.,](\d{1,2})$/.exec(s);
  if (decimal && !zeroDecimals) {
    int = s.slice(0, decimal.index);
    frac = decimal[1]!;
  } else if (zeroDecimals && decimal && !/[.,]\d{3}$/.test(s)) {
    // "12,5" en COP: decimales que la moneda no admite.
    return null;
  }
  // Los separadores de miles deben agrupar de 3 en 3.
  if (/[.,]/.test(int) && !/^\d{1,3}([.,]\d{3})+$/.test(int)) return null;
  const digits = int.replace(/[.,]/g, "").replace(/^0+(?=\d)/, "");
  const canonical = frac ? `${digits}.${frac}` : digits;
  return Number(canonical) === 0 ? canonical : `${sign}${canonical}`;
}


export const accountIdParamsSchema = z.object({ id: z.string().trim().min(1).max(64) });
