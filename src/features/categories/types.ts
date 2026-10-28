import type { CategoryNature, RuleField, RuleMatch, RuleSource } from "@/features/categories/schemas";

/** Lo mínimo para selects de formularios (Quick Add, edición de movimientos, filtros). */
export interface CategoryOptionDTO {
  id: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
  parentId: string | null;
  color: string | null;
  icon: string | null;
}

/** `GET /api/v1/categories` (superset de CategoryOptionDTO). */
export interface CategoryDTO extends CategoryOptionDTO {
  nature: CategoryNature;
  sortOrder: number;
  /** ISO; null = activa. */
  archivedAt: string | null;
  /** Tiene movimientos (también borrados), presupuestos o recurrentes → el tipo queda bloqueado. */
  inUse: boolean;
}

/** `GET /api/v1/categorization-rules`, en orden de evaluación (USER → LEARNED → SYSTEM, priority). */
export interface CategorizationRuleDTO {
  id: string;
  field: RuleField;
  match: RuleMatch;
  /** Guardado con foldText() salvo REGEX (tal cual). */
  pattern: string;
  priority: number;
  source: RuleSource;
  hitCount: number;
  lastHitAt: string | null;
  isActive: boolean;
  createdAt: string;
  category: { id: string; name: string; kind: "INCOME" | "EXPENSE"; color: string | null; icon: string | null; archived: boolean };
}

export interface PayeeOptionDTO {
  id: string;
  name: string;
}
