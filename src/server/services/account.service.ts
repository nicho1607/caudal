import type { AccountType } from "@/generated/prisma/client";
import { db } from "@/server/db";

export interface AccountBalance {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  color: string | null;
  /** initialBalance + Σ amount de los movimientos no borrados, en la moneda de la cuenta. */
  balance: number;
}

/** Cuentas activas (no archivadas) del usuario con su saldo actual, en orden de UI. */
export async function listAccountBalances(userId: string): Promise<AccountBalance[]> {
  const [accounts, sums] = await Promise.all([
    db.account.findMany({
      where: { userId, archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, type: true, currency: true, color: true, initialBalance: true },
    }),
    db.transaction.groupBy({
      by: ["accountId"],
      where: { userId, deletedAt: null },
      _sum: { amount: true },
    }),
  ]);

  const sumByAccount = new Map(sums.map((s) => [s.accountId, s._sum.amount]));

  return accounts.map(({ initialBalance, ...account }) => {
    const sum = sumByAccount.get(account.id);
    return {
      ...account,
      balance: initialBalance.add(sum ?? 0).toNumber(),
    };
  });
}
