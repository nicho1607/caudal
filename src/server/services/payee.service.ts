import type { PayeeOptionDTO } from "@/features/categories/types";
import { db } from "@/server/db";

/** Comercios/pagadores conocidos del usuario (nombre de display), por nombre. */
export async function listPayees(userId: string): Promise<PayeeOptionDTO[]> {
  return db.payee.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}
