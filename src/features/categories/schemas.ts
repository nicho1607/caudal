// Esquemas zod de categorías y reglas de categorización, compartidos por los
// formularios (react-hook-form + zodResolver) y los Route Handlers de
// /api/v1/categories y /api/v1/categorization-rules. Sin imports de servidor:
// este módulo también se importa desde el cliente.
import { z } from "zod";

export const CATEGORY_KINDS = ["EXPENSE", "INCOME"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const CATEGORY_NATURES = ["VARIABLE", "FIXED"] as const;
export type CategoryNature = (typeof CATEGORY_NATURES)[number];

export const CATEGORY_KIND_LABELS: Record<CategoryKind, string> = { EXPENSE: "Gastos", INCOME: "Ingresos" };
export const CATEGORY_NATURE_LABELS: Record<CategoryNature, string> = { FIXED: "Fijo", VARIABLE: "Variable" };

/** Colores de categoría: tokens del tema (`chart-3`) → `cssColor()`. */
export const CATEGORY_COLORS = ["chart-1", "chart-2", "chart-3", "chart-4", "chart-5", "chart-6"] as const;
export type CategoryColor = (typeof CATEGORY_COLORS)[number];

/** Nombre de icono Lucide en kebab-case ("shopping-cart"); el selector ofrece CATEGORY_ICON_NAMES. */
const iconSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Icono no válido")
  .max(40);

const categoryFields = {
  name: z.string().trim().min(1, "Ponle un nombre a la categoría").max(40, "Máximo 40 caracteres"),
  kind: z.enum(CATEGORY_KINDS),
  /** null = categoría principal. Máximo dos niveles. */
  parentId: z.string().trim().min(1).max(64).nullable(),
  nature: z.enum(CATEGORY_NATURES),
  color: z.enum(CATEGORY_COLORS).nullable(),
  icon: iconSchema.nullable(),
};

/** POST: `kind` es opcional si hay `parentId` (se hereda del padre). */
export const createCategorySchema = z.strictObject({
  name: categoryFields.name,
  kind: categoryFields.kind.optional(),
  parentId: categoryFields.parentId.optional(),
  nature: categoryFields.nature.optional(),
  color: categoryFields.color.optional(),
  icon: categoryFields.icon.optional(),
});

export const updateCategorySchema = z
  .strictObject({
    name: categoryFields.name.optional(),
    kind: categoryFields.kind.optional(),
    parentId: categoryFields.parentId.optional(),
    nature: categoryFields.nature.optional(),
    color: categoryFields.color.optional(),
    icon: categoryFields.icon.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "No hay cambios que guardar");

export const listCategoriesQuerySchema = z.object({
  /** `include=archived` → también las archivadas (página de ajustes). */
  include: z.literal("archived").optional(),
});

export const idParamsSchema = z.object({ id: z.string().trim().min(1).max(64) });

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

// ─── Reglas de categorización ───────────────────────────────────────────────

export const RULE_FIELDS = ["PAYEE", "DESCRIPTION"] as const;
export const RULE_MATCHES = ["CONTAINS", "STARTS_WITH", "EQUALS", "REGEX"] as const;
export const RULE_SOURCES = ["USER", "LEARNED", "SYSTEM"] as const;
export type RuleField = (typeof RULE_FIELDS)[number];
export type RuleMatch = (typeof RULE_MATCHES)[number];
export type RuleSource = (typeof RULE_SOURCES)[number];

export const RULE_FIELD_LABELS: Record<RuleField, string> = { PAYEE: "Comercio", DESCRIPTION: "Descripción" };
export const RULE_MATCH_LABELS: Record<RuleMatch, string> = {
  CONTAINS: "Contiene",
  STARTS_WITH: "Empieza por",
  EQUALS: "Es igual a",
  REGEX: "Expresión regular",
};
export const RULE_SOURCE_LABELS: Record<RuleSource, string> = { USER: "Tuya", LEARNED: "Aprendida", SYSTEM: "Sistema" };

export const RULE_PATTERN_MAX = 200;

const ruleFields = {
  field: z.enum(RULE_FIELDS),
  match: z.enum(RULE_MATCHES),
  pattern: z.string().trim().min(1, "Escribe un patrón").max(RULE_PATTERN_MAX, `Máximo ${RULE_PATTERN_MAX} caracteres`),
  categoryId: z.string().trim().min(1, "Elige una categoría").max(64),
  /** Menor = se evalúa antes (dentro del mismo origen). */
  priority: z.number().int("Debe ser un número entero").min(1, "Mínimo 1").max(10_000, "Máximo 10.000"),
  isActive: z.boolean(),
};

export const createRuleSchema = z.strictObject({
  field: ruleFields.field.optional(),
  match: ruleFields.match.optional(),
  pattern: ruleFields.pattern,
  categoryId: ruleFields.categoryId,
  priority: ruleFields.priority.optional(),
  isActive: ruleFields.isActive.optional(),
});

export const updateRuleSchema = z
  .strictObject({
    field: ruleFields.field.optional(),
    match: ruleFields.match.optional(),
    pattern: ruleFields.pattern.optional(),
    categoryId: ruleFields.categoryId.optional(),
    priority: ruleFields.priority.optional(),
    isActive: ruleFields.isActive.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "No hay cambios que guardar");

export type CreateRuleInput = z.infer<typeof createRuleSchema>;
export type UpdateRuleInput = z.infer<typeof updateRuleSchema>;

/** Prioridad por defecto de las reglas creadas por el usuario (LEARNED = 500, SYSTEM = 1000). */
export const USER_RULE_PRIORITY = 100;

/** Mensaje si el patrón REGEX no compila; null si es válido. Mismos flags que el matcher ("iu"). */
export function regexError(pattern: string): string | null {
  try {
    new RegExp(pattern, "iu");
    return null;
  } catch (error) {
    const detail = error instanceof Error ? error.message.replace(/^Invalid regular expression: /, "") : "";
    return `La expresión regular no es válida${detail ? ` (${detail})` : ""}.`;
  }
}

// ─── Formularios (Sheets) ───────────────────────────────────────────────────

export const categoryFormSchema = z.object({
  name: categoryFields.name,
  kind: z.enum(CATEGORY_KINDS),
  /** "" = categoría principal. */
  parentId: z.string(),
  nature: z.enum(CATEGORY_NATURES),
  color: z.enum(CATEGORY_COLORS),
  icon: z.string(),
});
export type CategoryFormValues = z.infer<typeof categoryFormSchema>;

export const ruleFormSchema = z
  .object({
    field: ruleFields.field,
    match: ruleFields.match,
    pattern: ruleFields.pattern,
    categoryId: ruleFields.categoryId,
    priority: z.string().trim().regex(/^\d{1,5}$/, "Debe ser un número entre 1 y 10.000"),
    isActive: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.match === "REGEX") {
      const error = regexError(v.pattern);
      if (error) ctx.addIssue({ code: "custom", path: ["pattern"], message: error });
    }
    const priority = Number(v.priority);
    if (priority < 1 || priority > 10_000) {
      ctx.addIssue({ code: "custom", path: ["priority"], message: "Debe ser un número entre 1 y 10.000" });
    }
  });
export type RuleFormValues = z.infer<typeof ruleFormSchema>;
