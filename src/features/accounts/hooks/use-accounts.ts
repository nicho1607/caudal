"use client";

import { useQuery } from "@tanstack/react-query";

import type { AccountDTO } from "@/features/accounts/types";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/** Cuentas activas con saldo (`GET /api/v1/accounts`). */
export function useAccounts({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.accounts.list(),
    queryFn: () => apiFetch<AccountDTO[]>("/api/v1/accounts"),
    enabled,
  });
}
