// Fábrica central de query keys de TanStack Query. Todas las claves cuelgan de
// la raíz de su dominio (`["transactions"]`, …) para poder invalidar un dominio
// entero con `queryClient.invalidateQueries({ queryKey: queryKeys.x.all })`.
// Los filtros se pasan como objeto serializable (mismo shape que la query string).

type Filters = Record<string, unknown>;

export const queryKeys = {
  dashboard: {
    all: ["dashboard"] as const,
    summary: (filters: Filters = {}) => ["dashboard", "summary", filters] as const,
  },
  transactions: {
    all: ["transactions"] as const,
    lists: () => ["transactions", "list"] as const,
    list: (filters: Filters = {}) => ["transactions", "list", filters] as const,
    detail: (id: string) => ["transactions", "detail", id] as const,
  },
  accounts: {
    all: ["accounts"] as const,
    list: () => ["accounts", "list"] as const,
    /** Página de cuentas: activas + archivadas (`?include=archived`). */
    overview: () => ["accounts", "overview"] as const,
    detail: (id: string) => ["accounts", "detail", id] as const,
  },
  categories: {
    all: ["categories"] as const,
    list: () => ["categories", "list"] as const,
    /** Ajustes: activas + archivadas (`?include=archived`). */
    overview: () => ["categories", "overview"] as const,
  },
  tags: {
    all: ["tags"] as const,
    list: () => ["tags", "list"] as const,
  },
  payees: {
    all: ["payees"] as const,
    list: (search = "") => ["payees", "list", search] as const,
  },
  budgets: {
    all: ["budgets"] as const,
    list: (filters: Filters = {}) => ["budgets", "list", filters] as const,
  },
  goals: {
    all: ["goals"] as const,
    list: () => ["goals", "list"] as const,
    detail: (id: string) => ["goals", "detail", id] as const,
  },
  categorize: {
    all: ["categorize"] as const,
    suggest: (input: { payee?: string; description?: string }) =>
      ["categorize", "suggest", input] as const,
    /** Reglas de categorización (ajustes; Quick Add lee sus comercios). */
    rules: () => ["categorize", "rules"] as const,
  },
} as const;
