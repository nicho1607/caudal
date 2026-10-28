import { accountIdParamsSchema } from "@/features/accounts/schemas";
import { handler } from "@/server/http";
import { archiveAccount } from "@/server/services/account.service";

/** POST /api/v1/accounts/[id]/archive → AccountDTO (idempotente; las cuentas nunca se borran). */
export const POST = handler({ params: accountIdParamsSchema }, ({ user, params }) => archiveAccount(user.id, params.id));
