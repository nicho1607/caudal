import type { TagDTO } from "@/features/tags/types";
import { db } from "@/server/db";

/** Etiquetas del usuario por nombre (filtros y formularios). */
export async function listTags(userId: string): Promise<TagDTO[]> {
  return db.tag.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true },
  });
}
