# src/server/ — the only layer that talks to Prisma

- Import the client as `import { db } from "@/server/db";`. Types/enums come from `@/generated/prisma/client` (e.g. `import { Prisma, type Transaction } from "@/generated/prisma/client"`). Never `new PrismaClient()` elsewhere.
- `db.ts` caches the client on `globalThis` outside production so `next dev` HMR doesn't leak pg pools.
- Every query filters by a `userId` resolved from the session (never from client input). Soft-deleted rows: filter `deletedAt: null`.
- Ad-hoc scripts outside the Next runtime need `import "dotenv/config"` before importing `db` (Next loads `.env` itself). Run them with `npx tsx --tsconfig tsconfig.json <file>`; on Windows dynamic imports of absolute paths need a `file:///` URL.
- `demo-user.ts` exports the fixed `DEMO_USER_ID` used by the seed; the demo account has 6 months of data (4 accounts, 2-level categories, budgets, recurring rules, a savings goal).
- Session: `getSessionUser()` from `@/server/auth` is the ONLY place that resolves the user (MVP: demo user; swap for Supabase there). It is wrapped in React `cache` and throws `UnauthorizedError` (→ 401) if missing.
- Route Handlers: `export const GET = handler({ query, body, params, status }, async ({ user, query, body, params, req }) => ...)` from `@/server/http`. Schemas are optional zod types and fully infer the ctx types. Return a value (JSON, `status` default 200), `undefined` (204) or a `Response`. Repeated query keys arrive as arrays; use `z.coerce` for numbers/dates.
- Errors: services throw `NotFoundError` / `HttpError(status, msg)` from `@/server/errors` (also re-exported by http.ts); `handler` maps ZodError → 400 `{ error, issues }`, HttpError → its status `{ error }`, anything else → 500 with a generic message (logged, never leaked).
- Testing handlers: `vi.mock("@/server/auth", ...)` then dynamically import `@/server/http`; use `// @vitest-environment node` (see tests/unit/http.test.ts).
