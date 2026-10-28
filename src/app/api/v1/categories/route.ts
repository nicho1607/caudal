import { handler } from "@/server/http";
import { listCategories } from "@/server/services/category.service";

/** GET /api/v1/categories → CategoryOptionDTO[] (activas, en orden de árbol). */
export const GET = handler({}, ({ user }) => listCategories(user.id));
