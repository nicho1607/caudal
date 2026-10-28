# src/server/ — the only layer that talks to Prisma

- Import the client as `import { db } from "@/server/db";`. Types/enums come from `@/generated/prisma/client` (e.g. `import { Prisma, type Transaction } from "@/generated/prisma/client"`). Never `new PrismaClient()` elsewhere.
- `db.ts` caches the client on `globalThis` outside production so `next dev` HMR doesn't leak pg pools.
- Every query filters by a `userId` resolved from the session (never from client input). Soft-deleted rows: filter `deletedAt: null`.
- Ad-hoc scripts outside the Next runtime need `import "dotenv/config"` before importing `db` (Next loads `.env` itself). Run them with `npx tsx --tsconfig tsconfig.json <file>`; on Windows dynamic imports of absolute paths need a `file:///` URL.
