import { createAccountSchema, listAccountsQuerySchema } from "@/features/accounts/schemas";
import { handler } from "@/server/http";
import { createAccount, listAccountBalances } from "@/server/services/account.service";

/** GET /api/v1/accounts → AccountDTO[] (activas; `?include=archived` también las archivadas). */
export const GET = handler({ query: listAccountsQuerySchema }, ({ user, query }) =>
  listAccountBalances(user.id, { includeArchived: query.include === "archived" }),
);

/** POST /api/v1/accounts → 201 AccountDTO. Sin `currency` = moneda base del usuario. */
export const POST = handler({ body: createAccountSchema, status: 201 }, ({ user, body }) => createAccount(user, body));
