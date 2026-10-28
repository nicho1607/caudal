// Categorías del usuario: lectura en orden de árbol y CRUD con dos niveles.
// Nunca se borran: se archivan (los movimientos, presupuestos y reglas las
// siguen referenciando). Reglas puras en category.logic.ts.
import type { CreateCategoryInput, UpdateCategoryInput } from "@/features/categories/schemas";
import type { CategoryDTO } from "@/features/categories/types";
import { db } from "@/server/db";
import { HttpError, NotFoundError } from "@/server/errors";
import { categoryNameKey, resolveCategoryPlacement } from "@/server/services/category.logic";

const categorySelect = {
  id: true,
  name: true,
  kind: true,
  parentId: true,
  color: true,
  icon: true,
  nature: true,
  sortOrder: true,
  archivedAt: true,
} as const;

type CategoryRow = {
  id: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
  parentId: string | null;
  color: string | null;
  icon: string | null;
  nature: "FIXED" | "VARIABLE";
  sortOrder: number;
  archivedAt: Date | null;
};

/** Ids (de entre `ids`) con movimientos (también borrados), presupuestos o recurrentes. */
async function usedCategoryIds(userId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const categoryId = { in: ids };
  const [tx, budgets, recurring] = await Promise.all([
    db.transaction.groupBy({ by: ["categoryId"], where: { userId, categoryId } }),
    db.budget.groupBy({ by: ["categoryId"], where: { userId, categoryId } }),
    db.recurringRule.groupBy({ by: ["categoryId"], where: { userId, categoryId } }),
  ]);
  return new Set([...tx, ...budgets, ...recurring].map((r) => r.categoryId).filter((id): id is string => !!id));
}

function toDTO(row: CategoryRow, used: Set<string>): CategoryDTO {
  return { ...row, archivedAt: row.archivedAt?.toISOString() ?? null, inUse: used.has(row.id) };
}

/** Cada padre seguido de sus hijas; hijas de un padre no listado van como raíz. */
function treeOrder<T extends { id: string; parentId: string | null }>(rows: T[]): T[] {
  const children = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    children.set(row.parentId, [...(children.get(row.parentId) ?? []), row]);
  }
  const ids = new Set(rows.map((r) => r.id));
  const roots = rows.filter((r) => !r.parentId || !ids.has(r.parentId));
  return roots.flatMap((root) => [root, ...(children.get(root.id) ?? [])]);
}

/**
 * Categorías del usuario en orden de árbol (sortOrder, luego nombre). Por
 * defecto sólo las activas (selects de formularios); `includeArchived` para ajustes.
 */
export async function listCategories(
  userId: string,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): Promise<CategoryDTO[]> {
  const rows = await db.category.findMany({
    where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: categorySelect,
  });
  const used = await usedCategoryIds(
    userId,
    rows.map((r) => r.id),
  );
  return treeOrder(rows).map((row) => toDTO(row, used));
}

export async function getCategory(userId: string, id: string): Promise<CategoryDTO> {
  const row = await db.category.findFirst({ where: { id, userId }, select: categorySelect });
  if (!row) throw new NotFoundError("Categoría no encontrada");
  return toDTO(row, await usedCategoryIds(userId, [id]));
}

async function loadParent(userId: string, parentId: string | null | undefined) {
  if (!parentId) return null;
  const parent = await db.category.findFirst({
    where: { id: parentId, userId },
    select: { id: true, kind: true, parentId: true, archivedAt: true },
  });
  if (!parent) throw new NotFoundError("Categoría padre no encontrada");
  return parent;
}

/** 409 si ya hay una hermana (mismo padre) con el mismo nombre, sin distinguir tildes ni mayúsculas. */
async function assertUniqueName(userId: string, parentId: string | null, name: string, exceptId?: string) {
  const siblings = await db.category.findMany({
    where: { userId, parentId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { name: true },
  });
  const key = categoryNameKey(name);
  if (siblings.some((s) => categoryNameKey(s.name) === key)) {
    throw new HttpError(409, `Ya existe una categoría «${name}» en ese nivel.`);
  }
}

export async function createCategory(userId: string, input: CreateCategoryInput): Promise<CategoryDTO> {
  const parent = await loadParent(userId, input.parentId);
  const { kind, parentId } = resolveCategoryPlacement({
    current: null,
    changes: { kind: input.kind, parentId: input.parentId ?? null },
    parent,
    hasChildren: false,
    inUse: false,
  });
  await assertUniqueName(userId, parentId, input.name);
  const last = await db.category.aggregate({ where: { userId, parentId }, _max: { sortOrder: true } });
  const created = await db.category.create({
    data: {
      userId,
      name: input.name,
      kind,
      parentId,
      nature: input.nature ?? "VARIABLE",
      color: input.color ?? null,
      icon: input.icon ?? null,
      sortOrder: (last._max.sortOrder ?? 0) + 1,
    },
    select: { id: true },
  });
  return getCategory(userId, created.id);
}

/** PATCH parcial: tipo bloqueado con uso, padre del mismo tipo y sin tercer nivel. */
export async function updateCategory(userId: string, id: string, input: UpdateCategoryInput): Promise<CategoryDTO> {
  const current = await db.category.findFirst({
    where: { id, userId },
    select: { id: true, name: true, kind: true, parentId: true },
  });
  if (!current) throw new NotFoundError("Categoría no encontrada");

  const finalParentId = input.parentId !== undefined ? input.parentId : current.parentId;
  const [parent, childCount, used] = await Promise.all([
    loadParent(userId, finalParentId),
    db.category.count({ where: { userId, parentId: id } }),
    usedCategoryIds(userId, [id]),
  ]);
  const { kind, parentId } = resolveCategoryPlacement({
    current,
    changes: { kind: input.kind, parentId: finalParentId },
    parent,
    hasChildren: childCount > 0,
    inUse: used.has(id),
  });
  const name = input.name ?? current.name;
  if (name !== current.name || parentId !== current.parentId) await assertUniqueName(userId, parentId, name, id);

  const moved = parentId !== current.parentId;
  const sortOrder = moved
    ? ((await db.category.aggregate({ where: { userId, parentId }, _max: { sortOrder: true } }))._max.sortOrder ?? 0) + 1
    : undefined;
  await db.category.update({
    where: { id },
    data: { name: input.name, kind, parentId, nature: input.nature, color: input.color, icon: input.icon, sortOrder },
  });
  return getCategory(userId, id);
}

/**
 * Archiva (idempotente) la categoría y sus subcategorías activas con la misma
 * marca de tiempo, para que restaurar el padre las devuelva juntas.
 */
export async function archiveCategory(userId: string, id: string): Promise<CategoryDTO> {
  const category = await db.category.findFirst({ where: { id, userId }, select: { archivedAt: true } });
  if (!category) throw new NotFoundError("Categoría no encontrada");
  if (!category.archivedAt) {
    const at = new Date();
    await db.category.updateMany({
      where: { userId, archivedAt: null, OR: [{ id }, { parentId: id }] },
      data: { archivedAt: at },
    });
  }
  return getCategory(userId, id);
}

/** Restaura (idempotente) y devuelve las subcategorías archivadas junto con ella. */
export async function unarchiveCategory(userId: string, id: string): Promise<CategoryDTO> {
  const category = await db.category.findFirst({
    where: { id, userId },
    select: { archivedAt: true, parent: { select: { name: true, archivedAt: true } } },
  });
  if (!category) throw new NotFoundError("Categoría no encontrada");
  if (category.parent?.archivedAt) {
    throw new HttpError(400, `Restaura primero la categoría «${category.parent.name}».`);
  }
  if (category.archivedAt) {
    await db.category.updateMany({
      where: { userId, OR: [{ id }, { parentId: id, archivedAt: category.archivedAt }] },
      data: { archivedAt: null },
    });
  }
  return getCategory(userId, id);
}
