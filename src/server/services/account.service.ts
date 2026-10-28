import type { Prisma } from "@/generated/prisma/client";
import type { CreateAccountInput, UpdateAccountInput } from "@/features/accounts/schemas";
import type { AccountDTO } from "@/features/accounts/types";
import type { SessionUser } from "@/server/auth";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { resolveAccountState } from "@/server/services/account.logic";

/** Cuenta con su saldo actual (ver AccountDTO). */
export type AccountBalance = AccountDTO;

const accountSelect = {
  id: true,
  name: true,
  type: true,
  currency: true,
  color: true,
  initialBalance: true,
  creditLimit: true,
  institution: true,
  last4: true,
  includeInNetWorth: true,
  archivedAt: true,
} satisfies Prisma.AccountSelect;

type AccountRow = Prisma.AccountGetPayload<{ select: typeof accountSelect }>;

/** Saldo = initialBalance + Σ amount no borrados; hasTransactions cuenta también los borrados (pueden restaurarse). */
async function withBalances(userId: string, accounts: AccountRow[]): Promise<AccountBalance[]> {
  if (accounts.length === 0) return [];
  const accountId = { in: accounts.map((a) => a.id) };
  const [sums, counts] = await Promise.all([
    db.transaction.groupBy({ by: ["accountId"], where: { userId, accountId, deletedAt: null }, _sum: { amount: true } }),
    db.transaction.groupBy({ by: ["accountId"], where: { userId, accountId }, _count: { _all: true } }),
  ]);
  const sumByAccount = new Map(sums.map((s) => [s.accountId, s._sum.amount]));
  const countByAccount = new Map(counts.map((c) => [c.accountId, c._count._all]));

  return accounts.map(({ initialBalance, creditLimit, archivedAt, ...account }) => ({
    ...account,
    balance: initialBalance.add(sumByAccount.get(account.id) ?? 0).toNumber(),
    initialBalance: initialBalance.toNumber(),
    creditLimit: creditLimit?.toNumber() ?? null,
    archivedAt: archivedAt?.toISOString() ?? null,
    hasTransactions: (countByAccount.get(account.id) ?? 0) > 0,
  }));
}

/**
 * Cuentas del usuario con su saldo actual, en orden de UI. Por defecto sólo las
 * activas (sidebar, Quick Add, filtros); `includeArchived` para la página de cuentas.
 */
export async function listAccountBalances(
  userId: string,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): Promise<AccountBalance[]> {
  const accounts = await db.account.findMany({
    where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: accountSelect,
  });
  return withBalances(userId, accounts);
}

/** Una cuenta (activa o archivada) del usuario; 404 si no existe o es de otro. */
export async function getAccountBalance(userId: string, id: string): Promise<AccountBalance> {
  const account = await db.account.findFirst({ where: { id, userId }, select: accountSelect });
  if (!account) throw new NotFoundError("Cuenta no encontrada");
  const [dto] = await withBalances(userId, [account]);
  return dto!;
}

export async function createAccount(
  user: Pick<SessionUser, "id" | "baseCurrency">,
  input: CreateAccountInput,
): Promise<AccountBalance> {
  const state = resolveAccountState(
    null,
    {
      type: input.type,
      currency: input.currency ?? user.baseCurrency,
      initialBalance: input.initialBalance,
      creditLimit: input.creditLimit ?? null,
    },
    false,
  );
  const last = await db.account.aggregate({ where: { userId: user.id }, _max: { sortOrder: true } });
  const account = await db.account.create({
    data: {
      userId: user.id,
      name: input.name,
      institution: input.institution ?? null,
      last4: input.last4 ?? null,
      color: input.color ?? null,
      includeInNetWorth: input.includeInNetWorth ?? true,
      sortOrder: (last._max.sortOrder ?? 0) + 1,
      ...state,
    },
    select: accountSelect,
  });
  const [dto] = await withBalances(user.id, [account]);
  return dto!;
}

/**
 * PATCH parcial. Tipo y moneda no cambian si la cuenta ya tiene movimientos
 * (400). Al dejar de ser tarjeta, el cupo pasa a null.
 */
export async function updateAccount(userId: string, id: string, input: UpdateAccountInput): Promise<AccountBalance> {
  const current = await db.account.findFirst({
    where: { id, userId },
    select: { type: true, currency: true, initialBalance: true, creditLimit: true },
  });
  if (!current) throw new NotFoundError("Cuenta no encontrada");
  const hasTransactions = (await db.transaction.count({ where: { userId, accountId: id }, take: 1 })) > 0;
  const state = resolveAccountState(current, input, hasTransactions);

  // type/currency/initialBalance/creditLimit salen ya validados en `state`.
  const { name, institution, last4, color, includeInNetWorth } = input;
  await db.account.update({
    where: { id },
    data: { name, institution, last4, color, includeInNetWorth, ...state },
  });
  return getAccountBalance(userId, id);
}

/** Archiva (idempotente): sale del sidebar, Quick Add y filtros; los movimientos se conservan. */
export async function archiveAccount(userId: string, id: string): Promise<AccountBalance> {
  const { count } = await db.account.updateMany({ where: { id, userId, archivedAt: null }, data: { archivedAt: new Date() } });
  if (count === 0) await assertOwned(userId, id);
  return getAccountBalance(userId, id);
}

/** Restaura una cuenta archivada (idempotente). */
export async function unarchiveAccount(userId: string, id: string): Promise<AccountBalance> {
  const { count } = await db.account.updateMany({ where: { id, userId, archivedAt: { not: null } }, data: { archivedAt: null } });
  if (count === 0) await assertOwned(userId, id);
  return getAccountBalance(userId, id);
}

async function assertOwned(userId: string, id: string) {
  const exists = await db.account.count({ where: { id, userId } });
  if (!exists) throw new NotFoundError("Cuenta no encontrada");
}
