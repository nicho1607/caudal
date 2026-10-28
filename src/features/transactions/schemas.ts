// Esquemas zod de movimientos, compartidos por los formularios (react-hook-form
// + zodResolver) y los Route Handlers de /api/v1/transactions. Sin imports de
// servidor: este módulo se importa también desde el cliente.
import { z } from "zod";

export const TRANSACTION_TYPES = ["INCOME", "EXPENSE", "TRANSFER"] as const;
export const TRANSACTION_STATUSES = ["PENDING", "CLEARED", "RECONCILED"] as const;
export const TRANSACTION_SORTS = ["date", "amount"] as const;

export const transactionTypeSchema = z.enum(TRANSACTION_TYPES);
export const transactionStatusSchema = z.enum(TRANSACTION_STATUSES);

/** Importe máximo que cabe en Decimal(19,4). */
export const MAX_AMOUNT = 1e15;

/**
 * Importe SIEMPRE positivo: el signo lo aplica el servidor según `type`
 * (INCOME +, EXPENSE −, TRANSFER − en origen y + en destino). Acepta número o
 * string decimal ("12500", "12.5"); los decimales permitidos dependen de la
 * moneda de la cuenta (`currencyFractionDigits`) y se validan en el servidor.
 */
export const amountInputSchema = z
  .union([
    z.number().finite(),
    z
      .string()
      .trim()
      .regex(/^\d+(\.\d+)?$/, "Importe no válido"),
  ])
  .refine((v) => Number(v) > 0, "El importe debe ser mayor que 0")
  .refine((v) => Number(v) < MAX_AMOUNT, "Importe demasiado grande");

const isoDate = z.iso.date("Fecha no válida (yyyy-mm-dd)");
const id = z.string().trim().min(1).max(64);
const optionalText = (max: number) => z.string().trim().max(max).nullish();
const tagIds = z.array(id).max(20);

const baseFields = {
  accountId: id,
  amount: amountInputSchema,
  date: isoDate,
  description: optionalText(200),
  notes: optionalText(2000),
  status: transactionStatusSchema.optional(),
  tagIds: tagIds.optional(),
};

/** Ingreso o gasto. Sin `categoryId` (undefined) se auto-categoriza; `null` = sin categoría. */
export const createIncomeExpenseSchema = z.strictObject({
  type: z.enum(["INCOME", "EXPENSE"]),
  ...baseFields,
  categoryId: id.nullish(),
  /** Nombre del comercio/pagador; se busca o crea por nombre normalizado. */
  payee: optionalText(120),
});

/** Transferencia: dos patas (origen −, destino +). Sin categoría ni payee. */
export const createTransferSchema = z
  .strictObject({
    type: z.literal("TRANSFER"),
    ...baseFields,
    toAccountId: id,
  })
  .refine((v) => v.accountId !== v.toAccountId, {
    message: "Las cuentas de origen y destino deben ser distintas",
    path: ["toAccountId"],
  });

export const createTransactionSchema = z.discriminatedUnion("type", [
  createIncomeExpenseSchema,
  createTransferSchema,
]);

/**
 * PATCH parcial. En transferencias, amount/date/status/description/notes/tagIds
 * se aplican a las dos patas y `accountId` sólo a la pata editada;
 * `type`, `categoryId` y `payee` no se permiten (400).
 */
export const updateTransactionSchema = z
  .strictObject({
    type: z.enum(["INCOME", "EXPENSE"]).optional(),
    accountId: id.optional(),
    amount: amountInputSchema.optional(),
    date: isoDate.optional(),
    categoryId: id.nullable().optional(),
    payee: optionalText(120),
    description: optionalText(200),
    notes: optionalText(2000),
    status: transactionStatusSchema.optional(),
    tagIds: tagIds.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "No hay cambios");

/** Lista de ids en la query: `?accountIds=a&accountIds=b` o `?accountIds=a,b`. */
const idList = z
  .preprocess(
    (v) => (typeof v === "string" ? v.split(",").filter(Boolean) : v),
    z.array(id).max(100),
  )
  .optional();

const typeList = z
  .preprocess(
    (v) => (typeof v === "string" ? v.split(",").filter(Boolean) : v),
    z.array(transactionTypeSchema).max(3),
  )
  .optional();

/** GET /api/v1/transactions — mismo shape que el estado de filtros en la URL. */
export const listTransactionsQuerySchema = z
  .object({
    dateFrom: isoDate.optional(),
    dateTo: isoDate.optional(),
    accountIds: idList,
    categoryIds: idList,
    tagIds: idList,
    types: typeList,
    /** ILIKE sobre descripción + notas (índice trigram) o el nombre del payee. */
    q: z.string().trim().max(100).optional(),
    /**
     * Una fila por transferencia: oculta la pata de destino (la de origen trae
     * `transfer.counterpartAccount`) y el filtro de cuentas casa con cualquiera
     * de las dos patas. Lo usa la tabla de movimientos.
     */
    collapseTransfers: z
      .preprocess((v) => (v === "true" || v === "1" ? true : v === "false" || v === "0" ? false : v), z.boolean())
      .optional(),
    sort: z.enum(TRANSACTION_SORTS).default("date"),
    order: z.enum(["asc", "desc"]).default("desc"),
    cursor: z.string().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine((v) => !v.dateFrom || !v.dateTo || v.dateFrom <= v.dateTo, {
    message: "dateFrom debe ser anterior o igual a dateTo",
    path: ["dateTo"],
  });

export const transactionIdParamsSchema = z.object({ id });

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type CreateIncomeExpenseInput = z.infer<typeof createIncomeExpenseSchema>;
export type CreateTransferInput = z.infer<typeof createTransferSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
/** Lo que el formulario manda antes de los defaults (sort/order/limit opcionales). */
export type ListTransactionsFilters = z.input<typeof listTransactionsQuerySchema>;

// ─── Formulario de edición (Sheet) ──────────────────────────────────────────

/** "12,5" → "12.5"; sin espacios. El formulario acepta coma decimal. */
export function normalizeAmountInput(value: string): string {
  return value.replace(/\s/g, "").replace(",", ".");
}

/**
 * Valores del formulario de movimiento: todo string (inputs controlados).
 * `""` en categoryId = sin categoría; en description/payee/notes = vacío (null).
 */
export const transactionFormSchema = z.object({
  description: z.string().trim().max(200, "Máximo 200 caracteres"),
  payee: z.string().trim().max(120, "Máximo 120 caracteres"),
  amount: z
    .string()
    .trim()
    .min(1, "Indica un importe")
    .superRefine((value, ctx) => {
      const parsed = amountInputSchema.safeParse(normalizeAmountInput(value));
      if (!parsed.success) {
        ctx.addIssue({ code: "custom", message: parsed.error.issues[0]?.message ?? "Importe no válido" });
      }
    }),
  date: isoDate,
  accountId: z.string().min(1, "Elige una cuenta"),
  categoryId: z.string(),
  notes: z.string().trim().max(2000, "Máximo 2000 caracteres"),
});

export type TransactionFormValues = z.infer<typeof transactionFormSchema>;
