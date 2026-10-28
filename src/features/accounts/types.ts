/** GET /api/v1/accounts: cuenta activa con su saldo (moneda de la cuenta). */
export interface AccountDTO {
  id: string;
  name: string;
  type: "CHECKING" | "SAVINGS" | "CREDIT_CARD" | "CASH" | "INVESTMENT" | "LOAN" | "OTHER";
  currency: string;
  color: string | null;
  balance: number;
}
