import { cache } from "react";

import { db } from "@/server/db";
import { DEMO_USER_ID } from "@/server/demo-user";
import { UnauthorizedError } from "@/server/errors";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  baseCurrency: string;
  locale: string;
  timezone: string;
  weekStartsOn: number;
}

// Único punto de resolución de la sesión. MVP: siempre el usuario demo.
// Al integrar Supabase Auth basta con cambiar cómo se obtiene el id
// (supabase.auth.getUser()) — el resto de la app sólo usa SessionUser.
// `cache` deduplica la consulta dentro de un mismo request/render RSC.
export const getSessionUser = cache(async (): Promise<SessionUser> => {
  const user = await db.user.findUnique({
    where: { id: DEMO_USER_ID },
    select: {
      id: true,
      email: true,
      name: true,
      baseCurrency: true,
      locale: true,
      timezone: true,
      weekStartsOn: true,
    },
  });
  if (!user) {
    throw new UnauthorizedError("Usuario demo no encontrado; ejecuta `npm run db:seed`");
  }
  return user;
});
