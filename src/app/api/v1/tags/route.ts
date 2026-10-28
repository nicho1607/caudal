import { handler } from "@/server/http";
import { listTags } from "@/server/services/tag.service";

/** GET /api/v1/tags → TagDTO[] (por nombre). Sólo lectura por ahora. */
export const GET = handler({}, ({ user }) => listTags(user.id));
