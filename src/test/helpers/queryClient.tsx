import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

/**
 * Wrapper de QueryClient para tests de hooks. Cada llamada crea un cliente
 * nuevo (sin retries y sin cache compartido) para aislamiento total entre tests.
 */
export function createQueryWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return { Wrapper, queryClient: qc };
}
