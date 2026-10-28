// Lógica pura de la página de ajustes de categorías y reglas: árbol, valores
// de formulario ↔ payloads y la "prueba" en vivo de una regla (usa el mismo
// matcher puro que el servidor). Sin React: tests/unit/category-form.test.ts.
import {
  USER_RULE_PRIORITY,
  type CategoryColor,
  type CategoryFormValues,
  type CategoryKind,
  type CreateCategoryInput,
  type CreateRuleInput,
  type RuleFormValues,
  type UpdateCategoryInput,
  type UpdateRuleInput,
} from "@/features/categories/schemas";
import type { CategorizationRuleDTO, CategoryDTO } from "@/features/categories/types";
import { foldText, normalize, ruleMatches } from "@/server/services/categorization.match";

// ─── Árbol ──────────────────────────────────────────────────────────────────

export interface CategoryTreeNode {
  category: CategoryDTO;
  children: CategoryDTO[];
}

/**
 * Árbol de categorías activas de un tipo, en el orden recibido (el del API).
 * Una hija cuyo padre está archivado o no existe se muestra como principal.
 */
export function activeTree(categories: CategoryDTO[], kind: CategoryKind): CategoryTreeNode[] {
  const active = categories.filter((c) => !c.archivedAt && c.kind === kind);
  const ids = new Set(active.map((c) => c.id));
  return active
    .filter((c) => !c.parentId || !ids.has(c.parentId))
    .map((category) => ({ category, children: active.filter((c) => c.parentId === category.id) }));
}

/** Archivadas: cada una bajo su padre archivado si lo hay; si no, como raíz. */
export function archivedTree(categories: CategoryDTO[]): CategoryTreeNode[] {
  const archived = categories.filter((c) => c.archivedAt);
  const ids = new Set(archived.map((c) => c.id));
  return archived
    .filter((c) => !c.parentId || !ids.has(c.parentId))
    .map((category) => ({ category, children: archived.filter((c) => c.parentId === category.id) }));
}

/** Padres posibles para `kind`: principales activas del mismo tipo, sin contar `exceptId`. */
export function parentOptions(categories: CategoryDTO[], kind: CategoryKind, exceptId?: string): CategoryDTO[] {
  return categories.filter((c) => !c.archivedAt && !c.parentId && c.kind === kind && c.id !== exceptId);
}

/** Primer color de la paleta menos usado entre las principales (para sugerir uno libre). */
export function suggestCategoryColor(categories: CategoryDTO[], palette: readonly CategoryColor[]): CategoryColor {
  const counts = new Map<string, number>(palette.map((c) => [c, 0]));
  for (const c of categories) if (!c.parentId && !c.archivedAt && c.color && counts.has(c.color)) counts.set(c.color, counts.get(c.color)! + 1);
  return [...palette].sort((a, b) => counts.get(a)! - counts.get(b)!)[0]!;
}

// ─── Formulario de categoría ────────────────────────────────────────────────

export interface CategoryFormDefaults {
  kind: CategoryKind;
  parentId: string;
  color: CategoryColor;
}

export function toCategoryFormValues(category: CategoryDTO | null, defaults: CategoryFormDefaults): CategoryFormValues {
  if (!category) return { name: "", kind: defaults.kind, parentId: defaults.parentId, nature: "VARIABLE", color: defaults.color, icon: "" };
  return {
    name: category.name,
    kind: category.kind,
    parentId: category.parentId ?? "",
    nature: category.nature,
    color: (category.color as CategoryColor | null) ?? defaults.color,
    icon: category.icon ?? "",
  };
}

export function toCreateCategoryInput(values: CategoryFormValues): CreateCategoryInput {
  return {
    name: values.name.trim(),
    kind: values.kind,
    parentId: values.parentId || null,
    nature: values.nature,
    color: values.color,
    icon: values.icon || null,
  };
}

/** Sólo los campos cambiados; null si no hay cambios. */
export function toUpdateCategoryPayload(values: CategoryFormValues, category: CategoryDTO): UpdateCategoryInput | null {
  const next = toCreateCategoryInput(values);
  const patch: UpdateCategoryInput = {};
  if (next.name !== category.name) patch.name = next.name;
  if (next.kind !== category.kind) patch.kind = next.kind;
  if ((next.parentId ?? null) !== category.parentId) patch.parentId = next.parentId ?? null;
  if (next.nature !== category.nature) patch.nature = next.nature;
  if (next.color !== category.color) patch.color = next.color ?? null;
  if ((next.icon ?? null) !== category.icon) patch.icon = next.icon ?? null;
  return Object.keys(patch).length > 0 ? patch : null;
}

// ─── Formulario de regla ────────────────────────────────────────────────────

export function toRuleFormValues(rule: CategorizationRuleDTO | null, defaultCategoryId = ""): RuleFormValues {
  if (!rule) {
    return {
      field: "PAYEE",
      match: "CONTAINS",
      pattern: "",
      categoryId: defaultCategoryId,
      priority: String(USER_RULE_PRIORITY),
      isActive: true,
    };
  }
  return {
    field: rule.field,
    match: rule.match,
    pattern: rule.pattern,
    categoryId: rule.category.id,
    priority: String(rule.priority),
    isActive: rule.isActive,
  };
}

export function toCreateRuleInput(values: RuleFormValues): CreateRuleInput {
  return {
    field: values.field,
    match: values.match,
    pattern: values.pattern.trim(),
    categoryId: values.categoryId,
    priority: Number(values.priority),
    isActive: values.isActive,
  };
}

/** Sólo los campos cambiados; null si no hay cambios. Las reglas SYSTEM sólo mandan isActive. */
export function toUpdateRulePayload(values: RuleFormValues, rule: CategorizationRuleDTO): UpdateRuleInput | null {
  const patch: UpdateRuleInput = {};
  if (values.isActive !== rule.isActive) patch.isActive = values.isActive;
  if (rule.source !== "SYSTEM") {
    const next = toCreateRuleInput(values);
    if (next.field !== rule.field) patch.field = next.field;
    if (next.match !== rule.match) patch.match = next.match;
    if (next.pattern !== rule.pattern) patch.pattern = next.pattern;
    if (next.categoryId !== rule.category.id) patch.categoryId = next.categoryId;
    if (next.priority !== rule.priority) patch.priority = next.priority;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

export interface RuleTestResult {
  /** null = no hay texto de prueba o el patrón está vacío / no compila. */
  matches: boolean | null;
  /** Lo que compara el matcher (texto de prueba normalizado). */
  normalized: string;
}

/**
 * Prueba en vivo: ¿la regla, tal como se guardaría, coincide con `sample`?
 * Usa `ruleMatches` (el mismo matcher que el servidor) con el patrón plegado.
 */
export function testRule(values: Pick<RuleFormValues, "field" | "match" | "pattern">, sample: string): RuleTestResult {
  const text = sample.trim();
  const normalized = normalize(text);
  const pattern = values.match === "REGEX" ? values.pattern.trim() : foldText(values.pattern);
  if (!text || !pattern) return { matches: null, normalized };
  if (values.match === "REGEX") {
    try {
      new RegExp(pattern, "iu");
    } catch {
      return { matches: null, normalized };
    }
  }
  const input = values.field === "PAYEE" ? { payee: text } : { description: text };
  const matches = ruleMatches(
    { id: "test", categoryId: "test", field: values.field, match: values.match, pattern, priority: 0, source: "USER" },
    input,
  );
  return { matches, normalized };
}
