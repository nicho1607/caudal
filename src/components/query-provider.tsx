"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { getQueryClient } from "@/lib/query-client";

export function QueryProvider({ children }: { children: ReactNode }) {
  // No useState: si React suspende el primer render sin un boundary, el
  // cliente se perdería. getQueryClient() mantiene un singleton en navegador.
  const queryClient = getQueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
