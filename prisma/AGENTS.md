# prisma/ — schema and migrations

- Prisma 7: generator `prisma-client` → `src/generated/prisma` (gitignored). The datasource URL is NOT in the schema; `prisma.config.ts` loads `.env` (dotenv) and uses `DIRECT_URL` for CLI/migrations. The runtime client uses `DATABASE_URL` via `@prisma/adapter-pg` (see `src/server/db.ts`).
- New migration: `npx prisma migrate dev --name <snake_name>` (works fine from Git Bash on Windows). Regenerate the client with `npm run db:generate` if types look stale.
- Hand-written SQL (extensions, expression/partial indexes, triggers): `npx prisma migrate dev --create-only --name <name>`, edit the generated `migration.sql`, then `npx prisma migrate dev` to apply.
- Expression indexes are invisible to Prisma's diff, so later `migrate dev` runs will NOT try to drop them (verified with `transactions_search_trgm`). Keep them out of `schema.prisma`; document them in a comment there.
- `transactions_search_trgm` (pg_trgm GIN) indexes `coalesce(description,'') || ' ' || coalesce(notes,'')`. Search queries must use exactly that expression (via `$queryRaw` / `Prisma.sql`) or the index won't be used.
- Never edit an applied migration; add a new one.

## Seed (demo data)

- `npm run db:seed` runs `tsx prisma/seed.ts` (configured in `prisma.config.ts`). It is idempotent: deletes the demo user's transactions, then the user (everything else cascades), and recreates all data in one `$transaction`. Safe to rerun any time; dates are relative to today, content comes from a fixed-seed PRNG (`src/lib/prng.ts`).
- The demo user id/email live in `src/server/demo-user.ts` (`DEMO_USER_ID`, `DEMO_USER_EMAIL`).
- `Transaction.account` is `onDelete: Restrict`: deleting a user with transactions directly fails — delete the user's transactions first.
- Seed rows get client-generated ids (`randomUUID()`) so links (transfers, recurring rules, goal contributions, rule hits) can be built before `createMany`.
- Money in the seed is computed in integer cents and passed to Prisma as `(cents / 100).toFixed(2)` strings.
