// Gestión de reglas de categorización (ajustes). El matching vive en
// categorization.match.ts; aquí sólo CRUD. Patrones con foldText() salvo
// REGEX (validado). Las reglas SYSTEM sólo se activan/desactivan. Sin borrado:
// se desactivan.
import type { Prisma } from "@/generated/prisma/client";
import { USER_RULE_PRIORITY, type CreateRuleInput, type UpdateRuleInput } from "@/features/categories/schemas";
import type { CategorizationRuleDTO } from "@/features/categories/types";
import { db } from "@/server/db";
import { HttpError, NotFoundError } from "@/server/errors";
import { assertRulePatchAllowed, prepareRulePattern, resolveRulePattern } from "@/server/services/category.logic";

const ruleSelect = {
  id: true,
  field: true,
  match: true,
  pattern: true,
  priority: true,
  source: true,
  hitCount: true,
  lastHitAt: true,
  isActive: true,
  createdAt: true,
  category: { select: { id: true, name: true, kind: true, color: true, icon: true, archivedAt: true } },
} satisfies Prisma.CategorizationRuleSelect;

type RuleRow = Prisma.CategorizationRuleGetPayload<{ select: typeof ruleSelect }>;

const SOURCE_ORDER = { USER: 0, LEARNED: 1, SYSTEM: 2 } as const;

function toDTO({ category: { archivedAt, ...category }, lastHitAt, createdAt, ...rule }: RuleRow): CategorizationRuleDTO {
  return {
    ...rule,
    lastHitAt: lastHitAt?.toISOString() ?? null,
    createdAt: createdAt.toISOString(),
    category: { ...category, archived: archivedAt !== null },
  };
}

/** Todas las reglas (activas e inactivas) en orden de evaluación: USER → LEARNED → SYSTEM, priority, createdAt. */
export async function listRules(userId: string): Promise<CategorizationRuleDTO[]> {
  const rows = await db.categorizationRule.findMany({
    where: { userId },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: ruleSelect,
  });
  // Orden estable: sort() conserva el orden por priority dentro de cada origen.
  return rows.sort((a, b) => SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source]).map(toDTO);
}

async function getRule(userId: string, id: string): Promise<CategorizationRuleDTO> {
  const row = await db.categorizationRule.findFirst({ where: { id, userId }, select: ruleSelect });
  if (!row) throw new NotFoundError("Regla no encontrada");
  return toDTO(row);
}

async function assertActiveCategory(userId: string, categoryId: string) {
  const category = await db.category.findFirst({ where: { id: categoryId, userId }, select: { archivedAt: true } });
  if (!category) throw new NotFoundError("Categoría no encontrada");
  if (category.archivedAt) throw new HttpError(400, "La categoría está archivada.");
}

export async function createRule(userId: string, input: CreateRuleInput): Promise<CategorizationRuleDTO> {
  const match = input.match ?? "CONTAINS";
  const pattern = prepareRulePattern(match, input.pattern);
  await assertActiveCategory(userId, input.categoryId);
  const created = await db.categorizationRule.create({
    data: {
      userId,
      categoryId: input.categoryId,
      field: input.field ?? "PAYEE",
      match,
      pattern,
      priority: input.priority ?? USER_RULE_PRIORITY,
      isActive: input.isActive ?? true,
      source: "USER",
    },
    select: { id: true },
  });
  return getRule(userId, created.id);
}

/** PATCH parcial. SYSTEM: sólo isActive (400 si no). Cambiar match/pattern re-normaliza. */
export async function updateRule(userId: string, id: string, input: UpdateRuleInput): Promise<CategorizationRuleDTO> {
  const current = await db.categorizationRule.findFirst({
    where: { id, userId },
    select: { source: true, match: true, pattern: true },
  });
  if (!current) throw new NotFoundError("Regla no encontrada");
  assertRulePatchAllowed(current.source, input);
  const pattern = resolveRulePattern(current, input);
  if (input.categoryId !== undefined) await assertActiveCategory(userId, input.categoryId);
  await db.categorizationRule.update({
    where: { id },
    data: {
      field: input.field,
      match: input.match,
      pattern,
      categoryId: input.categoryId,
      priority: input.priority,
      isActive: input.isActive,
    },
  });
  return getRule(userId, id);
}
