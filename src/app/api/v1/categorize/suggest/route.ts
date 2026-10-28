import { z } from "zod";

import { handler } from "@/server/http";
import { suggest } from "@/server/services/categorization.service";

const text = z.string().trim().max(200).optional();

const query = z.object({ payee: text, description: text });

/**
 * GET /api/v1/categorize/suggest?payee=&description= →
 * `{ categoryId, ruleId, source }` (source USER | PAYEE | LEARNED | SYSTEM) o `null`.
 * Sólo lectura: no incrementa hitCount.
 */
export const GET = handler({ query }, async ({ user, query }) =>
  // `?? null` para devolver JSON `null` (undefined sería un 204).
  (await suggest(user.id, query)) ?? null,
);
