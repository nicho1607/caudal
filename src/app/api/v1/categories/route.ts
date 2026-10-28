import { createCategorySchema, listCategoriesQuerySchema } from "@/features/categories/schemas";
import { handler } from "@/server/http";
import { createCategory, listCategories } from "@/server/services/category.service";

/** GET /api/v1/categories → CategoryDTO[] en orden de árbol (activas; `?include=archived` también archivadas). */
export const GET = handler({ query: listCategoriesQuerySchema }, ({ user, query }) =>
  listCategories(user.id, { includeArchived: query.include === "archived" }),
);

/** POST /api/v1/categories → 201 CategoryDTO. Con `parentId` el tipo se hereda del padre. */
export const POST = handler({ body: createCategorySchema, status: 201 }, ({ user, body }) => createCategory(user.id, body));
