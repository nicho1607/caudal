// Formulario de Quick Add: schema (extiende transactionFormSchema) y conversión
// pura valores → cuerpo del POST. Sin React: testeado en tests/unit/quick-add-form.test.ts.
import { z } from "zod";

import { amountToString, fold, parseAmountText } from "@/features/quick-add/parse";
import { MAX_AMOUNT, transactionFormSchema, type CreateTransactionInput } from "@/features/transactions/schemas";

export const QUICK_ADD_TYPES = ["EXPENSE", "INCOME", "TRANSFER"] as const;
export type QuickAddFormType = (typeof QUICK_ADD_TYPES)[number];

/**
 * Mismos campos que el formulario de edición + tipo y cuenta destino. El
 * importe se interpreta con la moneda de la cuenta elegida ("18.500" en COP =
 * 18500), así que se valida a nivel de objeto. Sin `currencyOf` se valida
 * como moneda con centavos (sólo se comprueba que se pueda interpretar).
 */
export function quickAddFormSchema(currencyOf: (accountId: string) => string | undefined = () => undefined) {
  return transactionFormSchema
    .extend({
      type: z.enum(QUICK_ADD_TYPES),
      toAccountId: z.string(),
      amount: z.string().trim().min(1, "Indica un importe"),
    })
    .superRefine((v, ctx) => {
      const currency = currencyOf(v.accountId) ?? "XXX";
      const parsed = parseAmountText(v.amount, currency);
      if (!parsed || parsed.sign === "-") {
        ctx.addIssue({ code: "custom", path: ["amount"], message: "Importe no válido" });
      } else if (parsed.value >= MAX_AMOUNT) {
        ctx.addIssue({ code: "custom", path: ["amount"], message: "Importe demasiado grande" });
      }
      if (v.type === "TRANSFER") {
        if (!v.toAccountId) ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Elige la cuenta de destino" });
        else if (v.toAccountId === v.accountId) {
          ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Elige una cuenta distinta a la de origen" });
        }
      }
    });
}

export type QuickAddFormValues = z.infer<ReturnType<typeof quickAddFormSchema>>;

/** Etiquetas escritas con # → ids existentes (sin tildes ni mayúsculas) y las que no existen. */
export function matchTags(names: string[], tags: { id: string; name: string }[]) {
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const name of names) {
    const tag = tags.find((t) => fold(t.name) === fold(name));
    if (tag) {
      if (!ids.includes(tag.id)) ids.push(tag.id);
    } else if (!unknown.some((u) => fold(u) === fold(name))) {
      unknown.push(name);
    }
  }
  return { ids, unknown };
}

export interface ToCreateInputOptions {
  currency: string;
  /** El usuario eligió la categoría a mano (si no, el servidor auto-categoriza). */
  categoryChosen: boolean;
  tagIds: string[];
  /** Etiquetas que aún no existen: se guardan como "#nombre" en las notas. */
  unknownTags: string[];
}

/** Valores validados → cuerpo de POST /api/v1/transactions (importe positivo normalizado). */
export function toCreateInput(values: QuickAddFormValues, options: ToCreateInputOptions): CreateTransactionInput {
  const parsed = parseAmountText(values.amount, options.currency);
  if (!parsed) throw new Error("Importe no válido");
  const amount = amountToString(parsed.value, options.currency);
  const notes = [values.notes.trim(), options.unknownTags.map((t) => `#${t}`).join(" ")].filter(Boolean).join(" ");
  const common = {
    accountId: values.accountId,
    amount,
    date: values.date,
    description: values.description.trim() || null,
    notes: notes || null,
    ...(options.tagIds.length > 0 ? { tagIds: options.tagIds } : {}),
  };
  if (values.type === "TRANSFER") return { type: "TRANSFER", ...common, toAccountId: values.toAccountId };
  return {
    type: values.type,
    ...common,
    payee: values.payee.trim() || null,
    ...(options.categoryChosen ? { categoryId: values.categoryId || null } : {}),
  };
}
