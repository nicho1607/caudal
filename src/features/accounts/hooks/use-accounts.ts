"use client";

// Lectura y mutaciones de cuentas. Tras cada mutación se invalidan cuentas,
// dashboard y movimientos (KPIs, filtros, nombres) y se hace router.refresh()
// porque el sidebar se renderiza en el servidor (useInvalidateTransactionData).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import type { CreateAccountInput, UpdateAccountInput } from "@/features/accounts/schemas";
import type { AccountDTO } from "@/features/accounts/types";
import { useInvalidateTransactionData } from "@/features/transactions/hooks/use-transactions";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export const accountsApi = {
  list: () => apiFetch<AccountDTO[]>("/api/v1/accounts"),
  overview: () => apiFetch<AccountDTO[]>("/api/v1/accounts?include=archived"),
  create: (input: CreateAccountInput) =>
    apiFetch<AccountDTO>("/api/v1/accounts", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: UpdateAccountInput) =>
    apiFetch<AccountDTO>(`/api/v1/accounts/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }),
  archive: (id: string) => apiFetch<AccountDTO>(`/api/v1/accounts/${encodeURIComponent(id)}/archive`, { method: "POST" }),
  unarchive: (id: string) =>
    apiFetch<AccountDTO>(`/api/v1/accounts/${encodeURIComponent(id)}/unarchive`, { method: "POST" }),
};

/** Cuentas activas con saldo (`GET /api/v1/accounts`): formularios, filtros. */
export function useAccounts({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.accounts.list(),
    queryFn: accountsApi.list,
    enabled,
  });
}

/** Activas + archivadas (página de cuentas; la prefetchea su RSC con la misma clave). */
export function useAccountsOverview() {
  return useQuery({ queryKey: queryKeys.accounts.overview(), queryFn: accountsApi.overview });
}

export function useCreateAccount() {
  const invalidate = useInvalidateTransactionData();
  return useMutation({ mutationFn: accountsApi.create, onSettled: invalidate });
}

export function useUpdateAccount() {
  const invalidate = useInvalidateTransactionData();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAccountInput }) => accountsApi.update(id, input),
    onSettled: invalidate,
  });
}

/** Archivar / restaurar con cambio optimista de `archivedAt` en la página de cuentas. */
function useSetArchived(archived: boolean) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTransactionData();
  return useMutation({
    mutationFn: (id: string) => (archived ? accountsApi.archive(id) : accountsApi.unarchive(id)),
    onMutate: async (id) => {
      const key = queryKeys.accounts.overview();
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<AccountDTO[]>(key);
      queryClient.setQueryData<AccountDTO[]>(key, (old) =>
        old?.map((a) => (a.id === id ? { ...a, archivedAt: archived ? new Date().toISOString() : null } : a)),
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.accounts.overview(), context.previous);
    },
    onSettled: invalidate,
  });
}

export const useArchiveAccount = () => useSetArchived(true);
export const useUnarchiveAccount = () => useSetArchived(false);

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : undefined);

/** Archivar con toast "Cuenta archivada" + Deshacer (sin diálogos de confirmación) y Restaurar. */
export function useAccountActions() {
  const { mutateAsync: archiveAsync } = useArchiveAccount();
  const { mutateAsync: unarchiveAsync } = useUnarchiveAccount();

  const archive = useCallback(
    (account: Pick<AccountDTO, "id" | "name">) => {
      const pending = archiveAsync(account.id);
      pending.catch((error) => toast.error("No se pudo archivar la cuenta", { description: errorMessage(error) }));
      toast("Cuenta archivada", {
        description: account.name,
        duration: 5000,
        action: {
          label: "Deshacer",
          onClick: () => {
            pending
              .then(() => unarchiveAsync(account.id))
              .catch((error) => toast.error("No se pudo deshacer", { description: errorMessage(error) }));
          },
        },
      });
    },
    [archiveAsync, unarchiveAsync],
  );

  const restore = useCallback(
    async (account: Pick<AccountDTO, "id" | "name">) => {
      try {
        await unarchiveAsync(account.id);
        toast("Cuenta restaurada", { description: account.name });
      } catch (error) {
        toast.error("No se pudo restaurar la cuenta", { description: errorMessage(error) });
      }
    },
    [unarchiveAsync],
  );

  return { archive, restore };
}
