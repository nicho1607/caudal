import { accountIdParamsSchema, updateAccountSchema } from "@/features/accounts/schemas";
import { handler } from "@/server/http";
import { getAccountBalance, updateAccount } from "@/server/services/account.service";

const params = accountIdParamsSchema;

/** GET /api/v1/accounts/[id] → AccountDTO (también archivadas; 404 si no existe o es ajena). */
export const GET = handler({ params }, ({ user, params }) => getAccountBalance(user.id, params.id));

/** PATCH /api/v1/accounts/[id] → AccountDTO. Tipo/moneda con movimientos → 400. */
export const PATCH = handler({ params, body: updateAccountSchema }, ({ user, params, body }) =>
  updateAccount(user.id, params.id, body),
);
