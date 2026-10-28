// Conversión pura entre TransactionDTO, valores del formulario y cuerpos de la
// API (PATCH al editar, POST al duplicar). Sin React: testeado en
// tests/unit/transaction-form.test.ts.
import type {
  CreateTransactionInput,
  TransactionFormValues,
  UpdateTransactionInput,
} from "@/features/transactions/schemas";
import { normalizeAmountInput } from "@/features/transactions/schemas";
import type { TransactionDTO } from "@/features/transactions/types";

/** "-217400" → "217400" (el formulario siempre trabaja en positivo). */
export function absAmount(amount: string): string {
  return amount.startsWith("-") ? amount.slice(1) : amount;
}

export function toFormValues(t: TransactionDTO): TransactionFormValues {
  return {
    description: t.description ?? "",
    payee: t.payee?.name ?? "",
    amount: absAmount(t.amount),
    date: t.date,
    accountId: t.account.id,
    categoryId: t.category?.id ?? "",
    notes: t.notes ?? "",
  };
}

type Dirty = Partial<Record<keyof TransactionFormValues, boolean | undefined>>;

/**
 * Campos cuyo valor (ya recortado por el schema) difiere del inicial. Se calcula
 * aquí en vez de usar formState.dirtyFields de react-hook-form, que sólo se
 * rellena si el componente se suscribe leyéndolo durante el render.
 */
export function changedFields(values: TransactionFormValues, initial: TransactionFormValues): Dirty {
  const dirty: Dirty = {};
  for (const key of Object.keys(initial) as (keyof TransactionFormValues)[]) {
    if (values[key].trim() !== initial[key].trim()) dirty[key] = true;
  }
  return dirty;
}

const orNull = (v: string) => (v.trim() === "" ? null : v.trim());

/**
 * Cuerpo del PATCH con sólo los campos modificados; null si no hay cambios.
 * En transferencias no se envían categoría ni payee (el servidor los rechaza).
 */
export function toUpdatePayload(
  values: TransactionFormValues,
  dirty: Dirty,
  type: TransactionDTO["type"],
): UpdateTransactionInput | null {
  const patch: UpdateTransactionInput = {};
  if (dirty.description) patch.description = orNull(values.description);
  if (dirty.amount) patch.amount = normalizeAmountInput(values.amount);
  if (dirty.date) patch.date = values.date;
  if (dirty.accountId) patch.accountId = values.accountId;
  if (dirty.notes) patch.notes = orNull(values.notes);
  if (type !== "TRANSFER") {
    if (dirty.payee) patch.payee = orNull(values.payee);
    if (dirty.categoryId) patch.categoryId = values.categoryId || null;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * Cuerpo del POST para "Duplicar": misma cuenta, importe, categoría, payee,
 * notas y etiquetas, fechado `date` (hoy). Transferencias: origen → destino
 * según la pata que se duplica. Estado por defecto del servidor.
 */
export function duplicateInput(t: TransactionDTO, date: string): CreateTransactionInput {
  const common = {
    amount: absAmount(t.amount),
    date,
    description: t.description,
    notes: t.notes,
    tagIds: t.tags.map((tag) => tag.id),
  };
  if (t.type === "TRANSFER") {
    if (!t.transfer) throw new Error("Transferencia sin contrapartida");
    const out = t.transfer.direction === "out";
    return {
      type: "TRANSFER",
      ...common,
      accountId: out ? t.account.id : t.transfer.counterpartAccount.id,
      toAccountId: out ? t.transfer.counterpartAccount.id : t.account.id,
    };
  }
  return {
    type: t.type,
    ...common,
    accountId: t.account.id,
    categoryId: t.category?.id ?? null,
    payee: t.payee?.name ?? null,
  };
}

/** Coincide con una fila de cualquier listado: mismo id o misma transferencia. */
export interface TransactionTarget {
  id: string;
  transferGroupId: string | null;
}

export function matchesTarget(
  row: { id: string; transferGroupId?: string | null },
  target: TransactionTarget,
): boolean {
  return row.id === target.id || (!!target.transferGroupId && row.transferGroupId === target.transferGroupId);
}
