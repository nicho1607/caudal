import { handler } from "@/server/http";
import { listPayees } from "@/server/services/payee.service";

/** GET /api/v1/payees → PayeeOptionDTO[] (comercios conocidos; Quick Add los reconoce en el texto). */
export const GET = handler({}, ({ user }) => listPayees(user.id));
