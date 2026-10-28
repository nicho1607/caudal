// Auto-categorización (docs/ARQUITECTURA.md §1). Este módulo sólo carga datos y
// escribe; la decisión es pura y vive en `categorization.match.ts`.
//
// - suggest(): no muta nada (lo usa el endpoint de sugerencia y Quick Add).
// - applyCategorization() / recordRuleHit(): incrementan hitCount/lastHitAt;
//   llamarlos al GUARDAR una transacción auto-categorizada (TXN-001).
// - recordCorrection(): llamarlo cuando el usuario cambia la categoría de un
//   movimiento con payee; a la 2.ª corrección igual crea una regla LEARNED.
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import {
  LEARN_AFTER_CORRECTIONS,
  LEARNED_RULE_PRIORITY,
  normalize,
  suggestCategory,
  type CategorizationInput,
  type CategorySuggestion,
} from "@/server/services/categorization.match";

export { foldText, normalize } from "@/server/services/categorization.match";
export type {
  CategorizationInput,
  CategorySuggestion,
  SuggestionSource,
} from "@/server/services/categorization.match";

/** Carga reglas activas y payees con categoría del usuario. */
async function loadMatchData(userId: string) {
  const [rules, payees] = await Promise.all([
    db.categorizationRule.findMany({
      where: { userId, isActive: true },
      select: {
        id: true,
        categoryId: true,
        field: true,
        match: true,
        pattern: true,
        priority: true,
        source: true,
        createdAt: true,
      },
    }),
    db.payee.findMany({
      where: { userId, defaultCategoryId: { not: null } },
      select: { id: true, normalizedName: true, defaultCategoryId: true },
    }),
  ]);
  return { rules, payees };
}

/** Sugerencia de categoría para un payee/descripción. Sólo lectura. */
export async function suggest(
  userId: string,
  input: CategorizationInput,
): Promise<CategorySuggestion | null> {
  if (!input.payee?.trim() && !input.description?.trim()) return null;
  const { rules, payees } = await loadMatchData(userId);
  return suggestCategory(input, rules, payees);
}

/** Suma un acierto a la regla (hitCount + 1, lastHitAt = at). Ignora reglas ajenas. */
export async function recordRuleHit(userId: string, ruleId: string, at: Date = new Date()) {
  await db.categorizationRule.updateMany({
    where: { id: ruleId, userId },
    data: { hitCount: { increment: 1 }, lastHitAt: at },
  });
}

/** suggest() + registra el acierto de la regla usada (si la hay). Para el guardado. */
export async function applyCategorization(
  userId: string,
  input: CategorizationInput,
  at: Date = new Date(),
): Promise<CategorySuggestion | null> {
  const suggestion = await suggest(userId, input);
  if (suggestion?.ruleId) await recordRuleHit(userId, suggestion.ruleId, at);
  return suggestion;
}

export interface CorrectionInput {
  /** Nombre del payee tal cual (se normaliza aquí). */
  payee: string;
  /** Categoría que eligió el usuario. */
  categoryId: string;
}

export interface CorrectionResult {
  /** Correcciones acumuladas para este payee → categoría. */
  corrections: number;
  /** Regla LEARNED creada o actualizada en esta llamada (null si aún no toca). */
  learnedRuleId: string | null;
}

/**
 * Registra que el usuario corrigió la categoría de un payee. Tras
 * LEARN_AFTER_CORRECTIONS correcciones al mismo payee y categoría crea (o
 * re-apunta) una regla LEARNED `PAYEE EQUALS <normalizado>`, y actualiza
 * `Payee.defaultCategoryId`: el payee conocido se evalúa ANTES que las reglas
 * LEARNED (docs §1), así que si no lo hiciéramos la regla nunca ganaría.
 */
export async function recordCorrection(
  userId: string,
  { payee, categoryId }: CorrectionInput,
): Promise<CorrectionResult> {
  const payeeNormalized = normalize(payee);
  if (!payeeNormalized) return { corrections: 0, learnedRuleId: null };

  return db.$transaction(async (tx) => {
    const category = await tx.category.findFirst({
      where: { id: categoryId, userId },
      select: { id: true },
    });
    if (!category) throw new NotFoundError("Categoría no encontrada");

    await tx.categorizationCorrection.create({
      data: { userId, payeeNormalized, categoryId },
    });
    const corrections = await tx.categorizationCorrection.count({
      where: { userId, payeeNormalized, categoryId },
    });
    if (corrections < LEARN_AFTER_CORRECTIONS) return { corrections, learnedRuleId: null };

    const existing = await tx.categorizationRule.findFirst({
      where: { userId, source: "LEARNED", field: "PAYEE", match: "EQUALS", pattern: payeeNormalized },
      orderBy: { createdAt: "asc" },
    });
    const rule = existing
      ? await tx.categorizationRule.update({
          where: { id: existing.id },
          data: { categoryId, isActive: true },
        })
      : await tx.categorizationRule.create({
          data: {
            userId,
            categoryId,
            field: "PAYEE",
            match: "EQUALS",
            pattern: payeeNormalized,
            priority: LEARNED_RULE_PRIORITY,
            source: "LEARNED",
          },
        });

    await tx.payee.updateMany({
      where: { userId, normalizedName: payeeNormalized },
      data: { defaultCategoryId: categoryId },
    });

    return { corrections, learnedRuleId: rule.id };
  });
}
