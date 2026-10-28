import { createRuleSchema } from "@/features/categories/schemas";
import { handler } from "@/server/http";
import { createRule, listRules } from "@/server/services/categorization-rule.service";

/** GET /api/v1/categorization-rules → CategorizationRuleDTO[] (activas e inactivas, en orden de evaluación). */
export const GET = handler({}, ({ user }) => listRules(user.id));

/** POST /api/v1/categorization-rules → 201 (source USER). REGEX inválido → 400. */
export const POST = handler({ body: createRuleSchema, status: 201 }, ({ user, body }) => createRule(user.id, body));
