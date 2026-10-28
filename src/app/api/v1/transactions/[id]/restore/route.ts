import { transactionIdParamsSchema } from "@/features/transactions/schemas";
import { handler } from "@/server/http";
import { restoreTransaction } from "@/server/services/transaction.service";

/** POST /api/v1/transactions/[id]/restore → TransactionDTO ("Deshacer" del borrado). */
export const POST = handler({ params: transactionIdParamsSchema }, ({ user, params }) =>
  restoreTransaction(user.id, params.id),
);
