import type { ReactNode } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { ErrorDetailsDialog } from "@/components/ui/ErrorDetailsDialog";
import { ConfirmProvider } from "@/components/feedback/ConfirmProvider";
import { AuthSnapshotSync } from "@/features/users";
import { AuthQueryCacheSync } from "@/lib/ui/AuthQueryCacheSync";
import { notifyError } from "@/lib/ui/appFeedback";

/**
 * Handlers globales: si una query/mutación no marca `meta.silent = true`,
 * mostramos un toast persistente con botón "Ver detalles" que abre el reporte
 * estructurado. Mutaciones/queries que ya manejan su propio error pueden
 * silenciar el global con `meta: { silent: true }`.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.silent) return;
      notifyError({ error, phase: "query", method: String(query.queryKey[0] ?? "query") });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      if (mutation.meta?.silent) return;
      // Si la mutación ya tiene un onError local, dejamos que él maneje el toast
      // (típicamente usando notifyError) para evitar notificaciones duplicadas.
      if (mutation.options.onError) return;
      notifyError({ error, phase: "mutation" });
    },
  }),
});

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem storageKey="forklift-theme">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthQueryCacheSync />
          <AuthSnapshotSync />
          <TooltipProvider>
            <Sonner />
            <ErrorDetailsDialog />
            <ConfirmProvider>{children}</ConfirmProvider>
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
