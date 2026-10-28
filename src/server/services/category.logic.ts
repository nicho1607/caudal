// Reglas puras de categorías y reglas de categorización (sin BD): dos niveles,
// tipo heredado/bloqueado, patrones normalizados con foldText() y REGEX
// validados. Tests en tests/unit/category-logic.test.ts.
import type { CategoryKind, RuleMatch, RuleSource, UpdateRuleInput } from "@/features/categories/schemas";
import { regexError } from "@/features/categories/schemas";
import { HttpError } from "@/server/errors";
import { foldText } from "@/server/services/categorization.match";

export interface CategoryNode {
  id: string;
  kind: CategoryKind;
  parentId: string | null;
}

export interface ParentNode extends CategoryNode {
  archivedAt: Date | null;
}

export interface PlacementInput {
  /** null al crear. */
  current: CategoryNode | null;
  changes: { kind?: CategoryKind; parentId?: string | null };
  /** El padre final ya cargado (null = principal). Debe ser del usuario. */
  parent: ParentNode | null;
  /** La categoría actual tiene subcategorías (activas o archivadas). */
  hasChildren: boolean;
  /** Tiene movimientos, presupuestos o recurrentes. */
  inUse: boolean;
}

/**
 * Tipo y padre finales tras aplicar `changes`. Lanza 400 si se rompe una regla:
 * máximo dos niveles, el padre comparte tipo, el tipo no cambia con uso ni con
 * subcategorías, una categoría con hijas no pasa a ser hija.
 */
export function resolveCategoryPlacement({ current, changes, parent, hasChildren, inUse }: PlacementInput): {
  kind: CategoryKind;
  parentId: string | null;
} {
  const parentId = parent?.id ?? null;
  if (parent) {
    if (current && parent.id === current.id) throw new HttpError(400, "Una categoría no puede ser su propia categoría padre.");
    if (parent.parentId) {
      throw new HttpError(400, "Sólo hay dos niveles: una subcategoría no puede tener subcategorías.");
    }
    if (parent.archivedAt && parent.id !== current?.parentId) throw new HttpError(400, "La categoría padre está archivada.");
    if (hasChildren) throw new HttpError(400, "Una categoría con subcategorías no puede convertirse en subcategoría.");
  }

  const kind = changes.kind ?? (current ? current.kind : parent?.kind);
  if (!kind) throw new HttpError(400, "Indica si la categoría es de gastos o de ingresos.");

  if (current && kind !== current.kind) {
    if (inUse) {
      throw new HttpError(400, "No se puede cambiar el tipo de una categoría que ya tiene movimientos o presupuestos.");
    }
    if (hasChildren) throw new HttpError(400, "No se puede cambiar el tipo de una categoría con subcategorías.");
  }
  if (parent && parent.kind !== kind) {
    throw new HttpError(400, "La subcategoría debe ser del mismo tipo que su categoría padre.");
  }
  return { kind, parentId };
}

/** Clave para detectar nombres repetidos entre hermanas ("Mercado" = "mercado"). */
export const categoryNameKey = (name: string) => foldText(name);

// ─── Reglas de categorización ───────────────────────────────────────────────

/**
 * Patrón tal como se guarda: REGEX tal cual (validado, 400 si no compila);
 * el resto con foldText() (lo que compara el matcher). 400 si queda vacío.
 */
export function prepareRulePattern(match: RuleMatch, pattern: string): string {
  const trimmed = pattern.trim();
  if (match === "REGEX") {
    const error = regexError(trimmed);
    if (error) throw new HttpError(400, error);
    if (!trimmed) throw new HttpError(400, "Escribe un patrón.");
    return trimmed;
  }
  const folded = foldText(trimmed);
  if (!folded) throw new HttpError(400, "El patrón necesita al menos una letra o un número.");
  return folded;
}

/** Las reglas del sistema sólo se activan/desactivan. */
export function assertRulePatchAllowed(source: RuleSource, patch: UpdateRuleInput): void {
  if (source !== "SYSTEM") return;
  const other = Object.keys(patch).filter((key) => key !== "isActive");
  if (other.length > 0) throw new HttpError(400, "Las reglas del sistema sólo se pueden activar o desactivar.");
}

/** Patrón final de un PATCH: re-normaliza si cambia el patrón o el tipo de coincidencia. */
export function resolveRulePattern(current: { match: RuleMatch; pattern: string }, patch: UpdateRuleInput): string | undefined {
  if (patch.pattern === undefined && (patch.match === undefined || patch.match === current.match)) return undefined;
  return prepareRulePattern(patch.match ?? current.match, patch.pattern ?? current.pattern);
}
