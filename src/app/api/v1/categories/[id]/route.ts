import { idParamsSchema, updateCategorySchema } from "@/features/categories/schemas";
import { handler } from "@/server/http";
import { getCategory, updateCategory } from "@/server/services/category.service";

const params = idParamsSchema;

/** GET /api/v1/categories/[id] → CategoryDTO (también archivadas; 404 si no existe o es ajena). */
export const GET = handler({ params }, ({ user, params }) => getCategory(user.id, params.id));

/** PATCH /api/v1/categories/[id] → CategoryDTO. Tipo con uso, tercer nivel o padre de otro tipo → 400. */
export const PATCH = handler({ params, body: updateCategorySchema }, ({ user, params, body }) =>
  updateCategory(user.id, params.id, body),
);
