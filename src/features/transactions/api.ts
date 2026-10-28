// Llamadas a /api/v1/transactions (lanzan Error con el mensaje del servidor).
import { apiFetch } from "@/lib/api";
import type { CreateTransactionInput, UpdateTransactionInput } from "@/features/transactions/schemas";
import type { TransactionDTO } from "@/features/transactions/types";

const base = "/api/v1/transactions";

export const transactionsApi = {
  get: (id: string) => apiFetch<TransactionDTO>(`${base}/${encodeURIComponent(id)}`),
  create: (input: CreateTransactionInput) =>
    apiFetch<TransactionDTO>(base, { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: UpdateTransactionInput) =>
    apiFetch<TransactionDTO>(`${base}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  remove: (id: string) => apiFetch<void>(`${base}/${encodeURIComponent(id)}`, { method: "DELETE" }),
  restore: (id: string) =>
    apiFetch<TransactionDTO>(`${base}/${encodeURIComponent(id)}/restore`, { method: "POST" }),
};
