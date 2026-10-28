import { createTransactionSchema, listTransactionsQuerySchema } from "@/features/transactions/schemas";
import { handler } from "@/server/http";
import { createTransaction, listTransactions } from "@/server/services/transaction.service";

/**
 * GET /api/v1/transactions?dateFrom&dateTo&accountIds&categoryIds&tagIds&types&q&sort&order&cursor&limit
 * → `{ items: TransactionDTO[], nextCursor }`.
 */
export const GET = handler({ query: listTransactionsQuerySchema }, ({ user, query }) =>
  listTransactions(user.id, query),
);

/** POST /api/v1/transactions → 201 TransactionDTO (en transferencias, la pata de origen). */
export const POST = handler({ body: createTransactionSchema, status: 201 }, ({ user, body }) =>
  createTransaction(user, body),
);
