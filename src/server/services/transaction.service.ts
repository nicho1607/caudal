// Movimientos: listado con filtros + cursor, alta (ingreso/gasto/transferencia),
// edición, borrado lógico y restauración. Todas las consultas filtran por el
// userId de la sesión; un id de otro usuario se comporta como inexistente (404).
// La lógica pura (signo, decimales, FX, patas, cursor, DTO) vive en
// transaction.logic.ts.
import { Prisma } from "@/generated/prisma/client";
import type {
  CreateIncomeExpenseInput,
  CreateTransactionInput,
  CreateTransferInput,
  ListTransactionsQuery,
  UpdateTransactionInput,
} from "@/features/transactions/schemas";
import type { TransactionDTO, TransactionListDTO } from "@/features/transactions/types";
import type { SessionUser } from "@/server/auth";
import { db } from "@/server/db";
import { HttpError, NotFoundError } from "@/server/errors";
import {
  normalize,
  recordCorrection,
  recordRuleHit,
  suggest,
} from "@/server/services/categorization.service";
import {
  buildTransferLegs,
  decimalToString,
  decodeCursor,
  encodeCursor,
  escapeLike,
  moneyFields,
  parseAmount,
  signedAmount,
  toTransactionDTO,
  type CounterpartRow,
} from "@/server/services/transaction.logic";

/** Lo que el servicio necesita del usuario de la sesión. */
export type TransactionUser = Pick<SessionUser, "id" | "baseCurrency">;

type Client = Prisma.TransactionClient | typeof db;

const transactionInclude = {
  account: { select: { id: true, name: true, currency: true, color: true } },
  category: { select: { id: true, name: true, color: true, icon: true, parentId: true } },
  payee: { select: { id: true, name: true } },
  tags: {
    select: { tag: { select: { id: true, name: true, color: true } } },
    orderBy: { tag: { name: "asc" } },
  },
} satisfies Prisma.TransactionInclude;

type IncludedRow = Prisma.TransactionGetPayload<{ include: typeof transactionInclude }>;

const notFound = () => new NotFoundError("Movimiento no encontrado");

function isoToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

// ─── Validación de referencias (siempre del mismo usuario) ──────────────────

async function getUsableAccount(client: Client, userId: string, accountId: string) {
  const account = await client.account.findFirst({
    where: { id: accountId, userId },
    select: { id: true, currency: true, archivedAt: true },
  });
  if (!account) throw new NotFoundError("Cuenta no encontrada");
  if (account.archivedAt) throw new HttpError(400, "La cuenta está archivada");
  return { id: account.id, currency: account.currency.trim() };
}

async function getCategory(userId: string, categoryId: string) {
  return db.category.findFirst({ where: { id: categoryId, userId }, select: { id: true, kind: true } });
}

async function assertCategory(userId: string, categoryId: string, type: "INCOME" | "EXPENSE") {
  const category = await getCategory(userId, categoryId);
  if (!category) throw new NotFoundError("Categoría no encontrada");
  if (category.kind !== type) {
    throw new HttpError(400, type === "INCOME" ? "La categoría no es de ingresos" : "La categoría no es de gastos");
  }
}

async function assertTags(userId: string, tagIds: string[] | undefined): Promise<string[]> {
  const ids = [...new Set(tagIds ?? [])];
  if (ids.length === 0) return ids;
  const found = await db.tag.count({ where: { userId, id: { in: ids } } });
  if (found !== ids.length) throw new NotFoundError("Etiqueta no encontrada");
  return ids;
}

/** Busca o crea el Payee por `normalize(name)`; null si el nombre queda vacío. */
async function findOrCreatePayee(client: Client, userId: string, name: string | null | undefined) {
  const trimmed = name?.trim();
  if (!trimmed) return null;
  const normalizedName = normalize(trimmed);
  if (!normalizedName) return null;
  return client.payee.upsert({
    where: { userId_normalizedName: { userId, normalizedName } },
    create: { userId, name: trimmed, normalizedName },
    update: {},
    select: { id: true, name: true },
  });
}

async function replaceTags(client: Client, transactionIds: string[], tagIds: string[]) {
  await client.transactionTag.deleteMany({ where: { transactionId: { in: transactionIds } } });
  if (tagIds.length === 0) return;
  await client.transactionTag.createMany({
    data: transactionIds.flatMap((transactionId) => tagIds.map((tagId) => ({ transactionId, tagId }))),
  });
}

// ─── Lectura ─────────────────────────────────────────────────────────────────

async function loadCounterparts(userId: string, rows: IncludedRow[]) {
  const groups = [...new Set(rows.map((r) => r.transferGroupId).filter((g): g is string => !!g))];
  const byId = new Map<string, CounterpartRow>();
  if (groups.length === 0) return byId;
  const legs = await db.transaction.findMany({
    where: { userId, transferGroupId: { in: groups } },
    select: { id: true, transferGroupId: true, account: { select: { id: true, name: true } } },
  });
  for (const row of rows) {
    if (!row.transferGroupId) continue;
    const other = legs.find((l) => l.transferGroupId === row.transferGroupId && l.id !== row.id);
    if (other) byId.set(row.id, other);
  }
  return byId;
}

async function toDTOs(userId: string, rows: IncludedRow[]): Promise<TransactionDTO[]> {
  const counterparts = await loadCounterparts(userId, rows);
  return rows.map((row) => toTransactionDTO(row, counterparts.get(row.id)));
}

/** Un movimiento del usuario (también borrado si `includeDeleted`), o 404. */
export async function getTransaction(
  userId: string,
  id: string,
  { includeDeleted = false }: { includeDeleted?: boolean } = {},
): Promise<TransactionDTO> {
  const row = await db.transaction.findFirst({
    where: { id, userId, ...(includeDeleted ? {} : { deletedAt: null }) },
    include: transactionInclude,
  });
  if (!row) throw notFound();
  const [dto] = await toDTOs(userId, [row]);
  return dto;
}

/**
 * Listado paginado por cursor (keyset sobre `(date|amount, id)`). Los filtros
 * se resuelven en SQL crudo para que `q` use el índice trigram
 * `transactions_search_trgm` (misma expresión exacta) y luego se hidratan las
 * filas con Prisma conservando el orden.
 */
export async function listTransactions(
  userId: string,
  query: ListTransactionsQuery,
): Promise<TransactionListDTO> {
  const { sort, order, limit } = query;
  const conds: Prisma.Sql[] = [Prisma.sql`t."userId" = ${userId}::uuid`, Prisma.sql`t."deletedAt" IS NULL`];

  if (query.dateFrom) conds.push(Prisma.sql`t."date" >= ${query.dateFrom}::date`);
  if (query.dateTo) conds.push(Prisma.sql`t."date" <= ${query.dateTo}::date`);
  if (query.collapseTransfers) {
    // Una fila por transferencia: sólo la pata de origen (importe negativo).
    conds.push(Prisma.sql`NOT (t."transferGroupId" IS NOT NULL AND t."amount" > 0)`);
  }
  if (query.accountIds?.length) {
    const ids = Prisma.join(query.accountIds);
    conds.push(
      query.collapseTransfers
        ? // La pata visible es la de origen: la transferencia casa también por la cuenta destino.
          Prisma.sql`(t."accountId" IN (${ids}) OR (t."transferGroupId" IS NOT NULL AND EXISTS (
            SELECT 1 FROM "transactions" o
            WHERE o."transferGroupId" = t."transferGroupId" AND o."id" <> t."id"
              AND o."userId" = ${userId}::uuid AND o."accountId" IN (${ids})
          )))`
        : Prisma.sql`t."accountId" IN (${ids})`,
    );
  }
  if (query.categoryIds?.length) {
    // Una categoría padre incluye sus subcategorías (igual que los presupuestos).
    const ids = Prisma.join(query.categoryIds);
    conds.push(Prisma.sql`t."categoryId" IN (
      SELECT c."id" FROM "categories" c
      WHERE c."userId" = ${userId}::uuid AND (c."id" IN (${ids}) OR c."parentId" IN (${ids}))
    )`);
  }
  if (query.tagIds?.length) {
    conds.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "transaction_tags" tt
      WHERE tt."transactionId" = t."id" AND tt."tagId" IN (${Prisma.join(query.tagIds)})
    )`);
  }
  if (query.types?.length) conds.push(Prisma.sql`t."type"::text IN (${Prisma.join(query.types)})`);
  if (query.q) {
    // Descripción + notas con la expresión idéntica a la del índice GIN
    // (migración search_trgm_index) O nombre del payee. Va como UNION de ids y
    // no como OR en el WHERE para que la primera rama siga usando el índice
    // trigram (un OR con una columna sin índice obliga a un filtro secuencial).
    const pattern = `%${escapeLike(query.q)}%`;
    conds.push(Prisma.sql`t."id" IN (
      SELECT s."id" FROM "transactions" s
      WHERE s."userId" = ${userId}::uuid
        AND (coalesce(s."description",'') || ' ' || coalesce(s."notes",'')) ILIKE ${pattern}
      UNION
      SELECT s."id" FROM "transactions" s
      JOIN "payees" p ON p."id" = s."payeeId"
      WHERE s."userId" = ${userId}::uuid AND p."userId" = ${userId}::uuid AND p."name" ILIKE ${pattern}
    )`);
  }

  const column = sort === "date" ? Prisma.sql`t."date"` : Prisma.sql`t."amount"`;
  const direction = Prisma.raw(order === "desc" ? "DESC" : "ASC");
  if (query.cursor) {
    const cursor = decodeCursor(query.cursor, sort);
    const value = sort === "date" ? Prisma.sql`${cursor.value}::date` : Prisma.sql`${cursor.value}::numeric`;
    const cmp = Prisma.raw(order === "desc" ? "<" : ">");
    conds.push(Prisma.sql`(${column}, t."id") ${cmp} (${value}, ${cursor.id})`);
  }

  const idRows = await db.$queryRaw<{ id: string }[]>`
    SELECT t."id" FROM "transactions" t
    WHERE ${Prisma.join(conds, " AND ")}
    ORDER BY ${column} ${direction}, t."id" ${direction}
    LIMIT ${limit + 1}
  `;

  const hasMore = idRows.length > limit;
  const pageIds = idRows.slice(0, limit).map((r) => r.id);
  if (pageIds.length === 0) return { items: [], nextCursor: null };

  const rows = await db.transaction.findMany({
    where: { userId, id: { in: pageIds } },
    include: transactionInclude,
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = pageIds.map((id) => byId.get(id)).filter((r): r is IncludedRow => !!r);
  const items = await toDTOs(userId, ordered);

  const last = ordered.at(-1);
  const nextCursor =
    hasMore && last
      ? encodeCursor({
          sort,
          value: sort === "date" ? last.date.toISOString().slice(0, 10) : decimalToString(last.amount),
          id: last.id,
        })
      : null;
  return { items, nextCursor };
}

// ─── Alta ────────────────────────────────────────────────────────────────────

/** POST: ingreso/gasto (signo por `type`, auto-categoría si falta categoryId) o transferencia. */
export async function createTransaction(
  user: TransactionUser,
  input: CreateTransactionInput,
): Promise<TransactionDTO> {
  return input.type === "TRANSFER" ? createTransfer(user, input) : createIncomeExpense(user, input);
}

async function createIncomeExpense(user: TransactionUser, input: CreateIncomeExpenseInput) {
  const account = await getUsableAccount(db, user.id, input.accountId);
  const money = moneyFields(
    signedAmount(input.type, parseAmount(input.amount, account.currency)),
    account.currency,
    user.baseCurrency,
  );
  const tagIds = await assertTags(user.id, input.tagIds);

  let categoryId: string | null = null;
  let categorizationRuleId: string | null = null;
  let autoCategorized = false;
  if (input.categoryId === undefined) {
    // = applyCategorization(), pero sólo cuenta el acierto si la categoría
    // sugerida es del mismo tipo (una regla de ingresos no categoriza un gasto).
    const suggestion = await suggest(user.id, { payee: input.payee, description: input.description });
    if (suggestion) {
      const category = await getCategory(user.id, suggestion.categoryId);
      if (category?.kind === input.type) {
        categoryId = category.id;
        categorizationRuleId = suggestion.ruleId;
        autoCategorized = true;
      }
    }
  } else if (input.categoryId) {
    await assertCategory(user.id, input.categoryId, input.type);
    categoryId = input.categoryId;
  }

  const created = await db.$transaction(async (tx) => {
    const payee = await findOrCreatePayee(tx, user.id, input.payee);
    return tx.transaction.create({
      data: {
        userId: user.id,
        accountId: account.id,
        type: input.type,
        status: input.status ?? "CLEARED",
        date: isoToDate(input.date),
        ...money,
        description: input.description || null,
        notes: input.notes || null,
        categoryId,
        payeeId: payee?.id ?? null,
        autoCategorized,
        categorizationRuleId,
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
      },
      select: { id: true },
    });
  });

  if (categorizationRuleId) await recordRuleHit(user.id, categorizationRuleId);
  return getTransaction(user.id, created.id);
}

async function createTransfer(user: TransactionUser, input: CreateTransferInput) {
  const [from, to] = await Promise.all([
    getUsableAccount(db, user.id, input.accountId),
    getUsableAccount(db, user.id, input.toAccountId),
  ]);
  const legs = buildTransferLegs(from, to, parseAmount(input.amount, from.currency), user.baseCurrency);
  const tagIds = await assertTags(user.id, input.tagIds);

  const [outLeg] = await db.$transaction((tx) =>
    Promise.all(
      legs.map((leg) =>
        tx.transaction.create({
          data: {
            userId: user.id,
            type: "TRANSFER",
            status: input.status ?? "CLEARED",
            date: isoToDate(input.date),
            ...leg,
            description: input.description || null,
            notes: input.notes || null,
            tags: { create: tagIds.map((tagId) => ({ tagId })) },
          },
          select: { id: true },
        }),
      ),
    ),
  );
  return getTransaction(user.id, outLeg.id);
}

// ─── Edición ─────────────────────────────────────────────────────────────────

/** PATCH /[id]. Un movimiento borrado o ajeno → 404. */
export async function updateTransaction(
  user: TransactionUser,
  id: string,
  patch: UpdateTransactionInput,
): Promise<TransactionDTO> {
  const current = await db.transaction.findFirst({
    where: { id, userId: user.id, deletedAt: null },
    include: { payee: { select: { name: true } }, category: { select: { kind: true } } },
  });
  if (!current) throw notFound();
  if (current.type === "TRANSFER") return updateTransfer(user, current, patch);

  const type = patch.type ?? current.type;
  const account = patch.accountId
    ? await getUsableAccount(db, user.id, patch.accountId)
    : { id: current.accountId, currency: current.currency.trim() };

  const data: Prisma.TransactionUncheckedUpdateInput = {};
  if (patch.amount !== undefined || patch.type !== undefined || patch.accountId !== undefined) {
    const positive =
      patch.amount !== undefined ? parseAmount(patch.amount, account.currency) : current.amount.abs();
    Object.assign(data, moneyFields(signedAmount(type, positive), account.currency, user.baseCurrency));
    data.accountId = account.id;
    data.type = type;
  }
  if (patch.date !== undefined) data.date = isoToDate(patch.date);
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.description !== undefined) data.description = patch.description || null;
  if (patch.notes !== undefined) data.notes = patch.notes || null;

  let correctedCategoryId: string | null = null;
  if (patch.categoryId !== undefined) {
    if (patch.categoryId) await assertCategory(user.id, patch.categoryId, type);
    data.categoryId = patch.categoryId;
    data.autoCategorized = false;
    data.categorizationRuleId = null;
    if (patch.categoryId && patch.categoryId !== current.categoryId) correctedCategoryId = patch.categoryId;
  } else if (patch.type && current.category && current.category.kind !== type) {
    // Cambió ingreso ↔ gasto: la categoría anterior ya no aplica.
    data.categoryId = null;
    data.autoCategorized = false;
    data.categorizationRuleId = null;
  }
  const tagIds = patch.tagIds !== undefined ? await assertTags(user.id, patch.tagIds) : undefined;

  const payeeName = await db.$transaction(async (tx) => {
    let name = current.payee?.name ?? null;
    if (patch.payee !== undefined) {
      const payee = await findOrCreatePayee(tx, user.id, patch.payee);
      data.payeeId = payee?.id ?? null;
      name = payee?.name ?? null;
    }
    await tx.transaction.update({ where: { id: current.id }, data });
    if (tagIds) await replaceTags(tx, [current.id], tagIds);
    return name;
  });

  // El usuario corrigió la categoría de un movimiento con payee → aprendizaje.
  if (correctedCategoryId && payeeName) {
    await recordCorrection(user.id, { payee: payeeName, categoryId: correctedCategoryId });
  }
  return getTransaction(user.id, current.id);
}

async function updateTransfer(
  user: TransactionUser,
  current: {
    id: string;
    accountId: string;
    currency: string;
    transferGroupId: string | null;
    amount: Prisma.Decimal;
  },
  patch: UpdateTransactionInput,
): Promise<TransactionDTO> {
  if (patch.type !== undefined) throw new HttpError(400, "No se puede cambiar el tipo de una transferencia");
  if (patch.categoryId !== undefined || patch.payee !== undefined) {
    throw new HttpError(400, "Las transferencias no tienen categoría ni payee");
  }

  const legs = current.transferGroupId
    ? await db.transaction.findMany({
        where: { userId: user.id, transferGroupId: current.transferGroupId, deletedAt: null },
        select: { id: true, accountId: true, currency: true, amount: true },
      })
    : [{ id: current.id, accountId: current.accountId, currency: current.currency, amount: current.amount }];

  let newAccount: { id: string; currency: string } | null = null;
  if (patch.accountId !== undefined && patch.accountId !== current.accountId) {
    newAccount = await getUsableAccount(db, user.id, patch.accountId);
    if (legs.some((l) => l.id !== current.id && l.accountId === newAccount!.id)) {
      throw new HttpError(400, "Las cuentas de origen y destino deben ser distintas");
    }
  }
  const tagIds = patch.tagIds !== undefined ? await assertTags(user.id, patch.tagIds) : undefined;

  const shared: Prisma.TransactionUncheckedUpdateInput = {};
  if (patch.date !== undefined) shared.date = isoToDate(patch.date);
  if (patch.status !== undefined) shared.status = patch.status;
  if (patch.description !== undefined) shared.description = patch.description || null;
  if (patch.notes !== undefined) shared.notes = patch.notes || null;

  const updates = await Promise.all(
    legs.map(async (leg) => {
      const data: Prisma.TransactionUncheckedUpdateInput = { ...shared };
      const isEdited = leg.id === current.id;
      const accountId = isEdited && newAccount ? newAccount.id : leg.accountId;
      const currency = isEdited && newAccount ? newAccount.currency : leg.currency.trim();
      if (patch.amount !== undefined || (isEdited && newAccount)) {
        const positive = patch.amount !== undefined ? parseAmount(patch.amount, currency) : leg.amount.abs();
        const amount = leg.amount.isNegative() ? positive.neg() : positive;
        Object.assign(data, moneyFields(amount, currency, user.baseCurrency));
        data.accountId = accountId;
      }
      return { id: leg.id, data };
    }),
  );

  await db.$transaction(async (tx) => {
    for (const { id, data } of updates) await tx.transaction.update({ where: { id }, data });
    if (tagIds) await replaceTags(tx, legs.map((l) => l.id), tagIds);
  });
  return getTransaction(user.id, current.id);
}

// ─── Borrado lógico / restauración (las dos patas juntas) ───────────────────

async function findAny(userId: string, id: string) {
  const row = await db.transaction.findFirst({
    where: { id, userId },
    select: { id: true, transferGroupId: true, deletedAt: true },
  });
  if (!row) throw notFound();
  return row;
}

function groupWhere(userId: string, row: { id: string; transferGroupId: string | null }) {
  return row.transferGroupId ? { userId, transferGroupId: row.transferGroupId } : { userId, id: row.id };
}

/** DELETE /[id]: marca deletedAt (en ambas patas si es transferencia). Idempotente. */
export async function deleteTransaction(userId: string, id: string): Promise<void> {
  const row = await findAny(userId, id);
  if (row.deletedAt) return;
  await db.transaction.updateMany({
    where: { ...groupWhere(userId, row), deletedAt: null },
    data: { deletedAt: new Date() },
  });
}

/** POST /[id]/restore: limpia deletedAt (ambas patas). Idempotente. */
export async function restoreTransaction(userId: string, id: string): Promise<TransactionDTO> {
  const row = await findAny(userId, id);
  if (row.deletedAt) {
    await db.transaction.updateMany({
      where: { ...groupWhere(userId, row), deletedAt: { not: null } },
      data: { deletedAt: null },
    });
  }
  return getTransaction(userId, id);
}
