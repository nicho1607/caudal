import { NextResponse } from "next/server";
import { z } from "zod";

import { getSessionUser, type SessionUser } from "@/server/auth";
import { HttpError } from "@/server/errors";

export { HttpError, NotFoundError, UnauthorizedError } from "@/server/errors";

type Infer<S> = S extends z.ZodType ? z.output<S> : undefined;
type InferParams<S> = S extends z.ZodType ? z.output<S> : Record<string, string | string[]>;

export interface HandlerConfig<
  B extends z.ZodType | undefined,
  Q extends z.ZodType | undefined,
  P extends z.ZodType | undefined,
> {
  /** Esquema del cuerpo JSON (POST/PATCH/PUT). */
  body?: B;
  /** Esquema de la query string. Las claves repetidas llegan como array. */
  query?: Q;
  /** Esquema de los params dinámicos de la ruta (p. ej. `{ id: z.uuid() }`). */
  params?: P;
  /** Status de la respuesta cuando el handler devuelve un valor (default 200). */
  status?: number;
}

export interface HandlerContext<B, Q, P> {
  req: Request;
  user: SessionUser;
  body: B;
  query: Q;
  params: P;
}

/** Contexto que Next pasa como segundo argumento a un Route Handler. */
export interface RouteContext {
  params?: Promise<unknown>;
}

export interface ErrorBody {
  error: string;
  issues?: z.core.$ZodIssue[];
}

function searchParamsToObject(searchParams: URLSearchParams) {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    out[key] = values.length > 1 ? values : values[0];
  }
  return out;
}

async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "El cuerpo no es JSON válido");
  }
}

export function errorResponse(error: unknown): NextResponse<ErrorBody> {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: "Datos no válidos", issues: error.issues }, { status: 400 });
  }
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
}

/**
 * Envuelve un Route Handler: resuelve el usuario de la sesión, valida
 * body/query/params con zod y traduce errores a JSON `{ error }`:
 * ZodError → 400, HttpError (NotFoundError → 404, …) → su status, resto → 500.
 * Si `fn` devuelve un `Response` se usa tal cual; si no, se serializa a JSON.
 */
export function handler<
  B extends z.ZodType | undefined = undefined,
  Q extends z.ZodType | undefined = undefined,
  P extends z.ZodType | undefined = undefined,
>(
  config: HandlerConfig<B, Q, P>,
  fn: (ctx: HandlerContext<Infer<B>, Infer<Q>, InferParams<P>>) => unknown,
) {
  return async (req: Request, routeCtx?: RouteContext): Promise<Response> => {
    try {
      const user = await getSessionUser();

      const rawParams = (await routeCtx?.params) ?? {};
      const params = (config.params ? config.params.parse(rawParams) : rawParams) as InferParams<P>;

      const query = (
        config.query
          ? config.query.parse(searchParamsToObject(new URL(req.url).searchParams))
          : undefined
      ) as Infer<Q>;

      const body = (config.body ? config.body.parse(await readJson(req)) : undefined) as Infer<B>;

      const result = await fn({ req, user, body, query, params });
      if (result instanceof Response) return result;
      if (result === undefined) return new NextResponse(null, { status: 204 });
      return NextResponse.json(result, { status: config.status ?? 200 });
    } catch (error) {
      return errorResponse(error);
    }
  };
}
