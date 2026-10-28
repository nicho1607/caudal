import { QueryClient, defaultShouldDehydrateQuery, isServer } from "@tanstack/react-query";

// Defaults compartidos por el cliente del navegador y por los QueryClient que
// crean las páginas RSC para hacer prefetch + HydrationBoundary.
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // > 0 para que el cliente no vuelva a pedir justo después de hidratar.
        staleTime: 60 * 1000,
        gcTime: 5 * 60 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      dehydrate: {
        // También se deshidratan queries pendientes (streaming de prefetch).
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === "pending",
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/** En servidor siempre un cliente nuevo (por request); en navegador, singleton. */
export function getQueryClient() {
  if (isServer) return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}
