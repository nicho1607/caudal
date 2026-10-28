import { idParamsSchema } from "@/features/categories/schemas";
import { handler } from "@/server/http";
import { archiveCategory } from "@/server/services/category.service";

/** POST /api/v1/categories/[id]/archive → CategoryDTO (idempotente; archiva también sus subcategorías). */
export const POST = handler({ params: idParamsSchema }, ({ user, params }) => archiveCategory(user.id, params.id));
