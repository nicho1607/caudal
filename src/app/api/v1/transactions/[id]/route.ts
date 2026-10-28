import { transactionIdParamsSchema, updateTransactionSchema } from "@/features/transactions/schemas";
import { handler } from "@/server/http";
import {
  deleteTransaction,
  getTransaction,
  updateTransaction,
} from "@/server/services/transaction.service";

const params = transactionIdParamsSchema;

/** GET /api/v1/transactions/[id] → TransactionDTO (404 si no existe, es ajeno o está borrado). */
export const GET = handler({ params }, ({ user, params }) => getTransaction(user.id, params.id));

/** PATCH /api/v1/transactions/[id] → TransactionDTO. Transferencias: mueve las dos patas. */
export const PATCH = handler({ params, body: updateTransactionSchema }, ({ user, params, body }) =>
  updateTransaction(user, params.id, body),
);

/** DELETE /api/v1/transactions/[id] → 204 (soft delete; ambas patas en transferencias). */
export const DELETE = handler({ params }, async ({ user, params }) => {
  await deleteTransaction(user.id, params.id);
});
