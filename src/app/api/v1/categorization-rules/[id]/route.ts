import { idParamsSchema, updateRuleSchema } from "@/features/categories/schemas";
import { handler } from "@/server/http";
import { updateRule } from "@/server/services/categorization-rule.service";

/** PATCH /api/v1/categorization-rules/[id] → CategorizationRuleDTO. SYSTEM: sólo `isActive`. */
export const PATCH = handler({ params: idParamsSchema, body: updateRuleSchema }, ({ user, params, body }) =>
  updateRule(user.id, params.id, body),
);
