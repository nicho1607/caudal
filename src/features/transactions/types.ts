// DTOs de /api/v1/transactions. Los importes Decimal viajan como STRING
// decimal exacto ("-217400", "12.5"): ver src/features/transactions/AGENTS.md.

export type TransactionTypeDTO = "INCOME" | "EXPENSE" | "TRANSFER";
export type TransactionStatusDTO = "PENDING" | "CLEARED" | "RECONCILED";

export interface TransactionDTO {
  id: string;
  type: TransactionTypeDTO;
  status: TransactionStatusDTO;
  /** yyyy-mm-dd */
  date: string;
  /** Con signo, en la moneda de la cuenta (positivo = entra dinero). */
  amount: string;
  /** Con signo, en la moneda base del usuario. */
  amountBase: string;
  currency: string;
  fxRate: string;
  description: string | null;
  notes: string | null;
  autoCategorized: boolean;
  categorizationRuleId: string | null;
  recurringRuleId: string | null;
  transferGroupId: string | null;
  account: { id: string; name: string; currency: string; color: string | null };
  category: {
    id: string;
    name: string;
    color: string | null;
    icon: string | null;
    parentId: string | null;
  } | null;
  payee: { id: string; name: string } | null;
  tags: { id: string; name: string; color: string | null }[];
  /** Sólo en transferencias: la otra pata. */
  transfer: {
    counterpartId: string;
    counterpartAccount: { id: string; name: string };
    direction: "out" | "in";
  } | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionListDTO {
  items: TransactionDTO[];
  /** Pasar como `?cursor=` para la página siguiente; null = no hay más. */
  nextCursor: string | null;
}
