import { idParamsSchema } from "@/features/categories/schemas";
import { handler } from "@/server/http";
import { unarchiveCategory } from "@/server/services/category.service";

/** POST /api/v1/categories/[id]/unarchive → CategoryDTO (idempotente; padre archivado → 400). */
export const POST = handler({ params: idParamsSchema }, ({ user, params }) => unarchiveCategory(user.id, params.id));
