import { handler } from "@/server/http";
import { listAccountBalances } from "@/server/services/account.service";

/** GET /api/v1/accounts → AccountBalance[] (activas, con saldo actual). */
export const GET = handler({}, ({ user }) => listAccountBalances(user.id));
