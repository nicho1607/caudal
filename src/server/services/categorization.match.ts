// Lógica pura de auto-categorización (docs/ARQUITECTURA.md §1): normalización
// de nombres de comercio y elección de categoría a partir de reglas y payees ya
// cargados. Sin acceso a BD → se prueba en tests/unit/categorization-match.test.ts.
// La seed (prisma/seed.ts) importa `normalize` de aquí para que los
// `Payee.normalizedName` y patrones guardados nunca diverjan del matcher.

export type RuleFieldValue = "PAYEE" | "DESCRIPTION";
export type RuleMatchValue = "CONTAINS" | "EQUALS" | "STARTS_WITH" | "REGEX";
export type RuleSourceValue = "USER" | "LEARNED" | "SYSTEM";

export interface MatchableRule {
  id: string;
  categoryId: string;
  field: RuleFieldValue;
  match: RuleMatchValue;
  pattern: string;
  priority: number;
  source: RuleSourceValue;
  /** Desempate estable entre reglas con la misma prioridad (más antigua primero). */
  createdAt?: Date;
}

export interface MatchablePayee {
  id: string;
  normalizedName: string;
  defaultCategoryId: string | null;
}

export interface CategorizationInput {
  payee?: string | null;
  description?: string | null;
}

/** `PAYEE` = acierto por `Payee.defaultCategoryId` (no hay regla, `ruleId` null). */
export type SuggestionSource = RuleSourceValue | "PAYEE";

export interface CategorySuggestion {
  categoryId: string;
  ruleId: string | null;
  source: SuggestionSource;
}

// ─── Normalización ───────────────────────────────────────────────────────────

/** Prefijos de extracto bancario que no forman parte del comercio. */
const PREFIX_RE = /^(?:compra\s+en|compra|pago\s+pse|pago\s+en|pago|pse|pos)\s+/;

/** Sufijos societarios (ya sin puntos): S.A.S., S.A., S.L., LTDA, E.S.P., S. en C. */
const SUFFIX_RE = /\s+(?:s\s?a\s?s|s\s?a|s\s?l|ltda|e\s?s\s?p|s\s+en\s+c)$/;

/** Referencias numéricas al final ("… 99881", restos de "*4821"). */
const TRAILING_NUMBER_RE = /\s+\d+$/;

/**
 * Pliega mayúsculas, acentos, puntuación y espacios. Es lo que se aplica a los
 * patrones de regla (no recorta sufijos ni números: "tienda 24" sigue entero).
 */
export function foldText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}&]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Nombre de comercio normalizado: minúsculas, sin acentos ni puntuación, sin
 * prefijos de extracto ("COMPRA EN", "PSE"), sufijos societarios ("S.A.S.",
 * "LTDA") ni referencias numéricas finales ("*4821", "99881").
 *
 *   normalize("ÉXITO COLINA*4821")       → "exito colina"
 *   normalize("Soluciones Andinas S.A.S.") → "soluciones andinas"
 */
export function normalize(value: string | null | undefined): string {
  if (!value) return "";
  let out = foldText(value);
  let prev: string;
  do {
    prev = out;
    out = out.replace(PREFIX_RE, "");
  } while (out !== prev);
  do {
    prev = out;
    out = out.replace(TRAILING_NUMBER_RE, "").replace(SUFFIX_RE, "");
  } while (out !== prev);
  // Si todo era prefijo/sufijo/número, mejor el texto plegado que vacío.
  return out || foldText(value);
}

// ─── Matching ────────────────────────────────────────────────────────────────

const regexCache = new Map<string, RegExp | null>();

/** Compila (con caché) un patrón REGEX sin distinguir mayúsculas; inválido → null. */
function compileRegex(pattern: string): RegExp | null {
  if (regexCache.has(pattern)) return regexCache.get(pattern)!;
  let re: RegExp | null;
  try {
    re = new RegExp(pattern, "iu");
  } catch {
    re = null;
  }
  regexCache.set(pattern, re);
  return re;
}

interface PreparedInput {
  /** Texto original y normalizado de cada campo. */
  PAYEE: { raw: string; normalized: string };
  DESCRIPTION: { raw: string; normalized: string };
}

/**
 * Prepara la entrada. Si no viene payee (p. ej. Quick Add sólo con descripción),
 * las reglas PAYEE se evalúan sobre la descripción: es el único texto de comercio.
 */
function prepareInput(input: CategorizationInput): PreparedInput {
  const description = input.description?.trim() ?? "";
  const payee = input.payee?.trim() || description;
  return {
    PAYEE: { raw: payee, normalized: normalize(payee) },
    DESCRIPTION: { raw: description, normalized: normalize(description) },
  };
}

/** ¿La regla coincide? Un REGEX inválido nunca coincide (no lanza). */
export function ruleMatches(rule: MatchableRule, input: CategorizationInput): boolean {
  return matchPrepared(rule, prepareInput(input));
}

function matchPrepared(rule: MatchableRule, input: PreparedInput): boolean {
  const { raw, normalized } = input[rule.field];
  if (!raw) return false;
  if (rule.match === "REGEX") {
    const re = compileRegex(rule.pattern);
    return re !== null && (re.test(normalized) || re.test(raw));
  }
  const pattern = foldText(rule.pattern);
  if (!pattern) return false;
  switch (rule.match) {
    case "EQUALS":
      return normalized === pattern;
    case "STARTS_WITH":
      return normalized.startsWith(pattern);
    case "CONTAINS":
      return normalized.includes(pattern);
    default:
      return false;
  }
}

/** Orden de evaluación dentro de un mismo nivel: priority asc, luego createdAt, luego id. */
function byPriority(a: MatchableRule, b: MatchableRule): number {
  return (
    a.priority - b.priority ||
    (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) ||
    a.id.localeCompare(b.id)
  );
}

function firstMatch(
  rules: MatchableRule[],
  source: RuleSourceValue,
  input: PreparedInput,
): CategorySuggestion | null {
  const candidates = rules.filter((r) => r.source === source).sort(byPriority);
  for (const rule of candidates) {
    if (matchPrepared(rule, input)) {
      return { categoryId: rule.categoryId, ruleId: rule.id, source };
    }
  }
  return null;
}

/**
 * Sugerencia de categoría (docs §1). Primera coincidencia en este orden:
 * 1. reglas USER por priority · 2. payee conocido (normalizedName exacto con
 * defaultCategoryId) · 3. reglas LEARNED · 4. reglas SYSTEM · 5. null.
 * `rules` deben ser sólo las activas del usuario. No muta nada.
 */
export function suggestCategory(
  input: CategorizationInput,
  rules: MatchableRule[],
  payees: MatchablePayee[],
): CategorySuggestion | null {
  const prepared = prepareInput(input);
  if (!prepared.PAYEE.raw && !prepared.DESCRIPTION.raw) return null;

  const user = firstMatch(rules, "USER", prepared);
  if (user) return user;

  const payeeName = prepared.PAYEE.normalized;
  if (payeeName) {
    const known = payees.find((p) => p.normalizedName === payeeName && p.defaultCategoryId);
    if (known) return { categoryId: known.defaultCategoryId!, ruleId: null, source: "PAYEE" };
  }

  return firstMatch(rules, "LEARNED", prepared) ?? firstMatch(rules, "SYSTEM", prepared);
}

/** Correcciones (mismo payee → misma categoría) necesarias para crear una regla LEARNED. */
export const LEARN_AFTER_CORRECTIONS = 2;

/** Prioridad de las reglas LEARNED (las USER suelen ir en 100, las SYSTEM en 1000). */
export const LEARNED_RULE_PRIORITY = 500;
