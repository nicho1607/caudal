import { accountIdParamsSchema } from "@/features/accounts/schemas";
import { handler } from "@/server/http";
import { unarchiveAccount } from "@/server/services/account.service";

/** POST /api/v1/accounts/[id]/unarchive → AccountDTO ("Restaurar" y "Deshacer" del archivado). */
export const POST = handler({ params: accountIdParamsSchema }, ({ user, params }) =>
  unarchiveAccount(user.id, params.id),
);
