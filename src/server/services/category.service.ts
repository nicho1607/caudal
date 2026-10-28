import type { CategoryOptionDTO } from "@/features/categories/types";
import { db } from "@/server/db";

/**
 * Categorías activas del usuario en orden de árbol: cada padre seguido de sus
 * hijas (por sortOrder, luego nombre). Para selects de formularios.
 */
export async function listCategories(userId: string): Promise<CategoryOptionDTO[]> {
  const rows = await db.category.findMany({
    where: { userId, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, kind: true, parentId: true, color: true, icon: true },
  });
  const children = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.parentId) continue;
    children.set(row.parentId, [...(children.get(row.parentId) ?? []), row]);
  }
  const ids = new Set(rows.map((r) => r.id));
  // Hijas de un padre archivado se listan como raíz para no perderlas.
  const roots = rows.filter((r) => !r.parentId || !ids.has(r.parentId));
  return roots.flatMap((root) => [root, ...(children.get(root.id) ?? [])]);
}
