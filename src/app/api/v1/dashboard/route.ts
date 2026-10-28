import { z } from "zod";

import { handler } from "@/server/http";
import { getDashboard } from "@/server/services/dashboard.service";

const query = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Formato de mes: YYYY-MM")
    .optional(),
});

/** GET /api/v1/dashboard?month=YYYY-MM → DashboardData (sin `month` = mes en curso). */
export const GET = handler({ query }, ({ user, query }) =>
  getDashboard(user.id, { month: query.month }),
);
