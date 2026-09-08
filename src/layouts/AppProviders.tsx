import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ThemeProvider } from "next-themes";
import { ConfirmProvider } from "@/components/feedback/ConfirmProvider";
import { ErrorDetailsDialog } from "@/components/ui/ErrorDetailsDialog";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthSnapshotSync } from "@/features/users";
import {
  createBrowserPersister,
  shouldPersistQuery,
  PERSIST_MAX_AGE_MS,
} from "@/lib/query/persister";
import { AuthQueryCacheSync } from "@/lib/ui/AuthQueryCacheSync";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

// `createBrowserPersister` tiene fallback in-memory cuando no hay `window`
// (SSR) — seguro a nivel módulo.
const persister = createBrowserPersister();

export function AppProviders({ queryClient, children }: { queryClient: QueryClient; children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem storageKey="forklift-theme">
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: PERSIST_MAX_AGE_MS,
          dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
        }}
      >
        <AuthProvider>
          <AuthQueryCacheSync />
          <AuthSnapshotSync />
          {/* Delay global acordado (300ms): único TooltipProvider de la app.
              Excepción deliberada: el sidebar mantiene su propio provider con
              delayDuration={0} para tooltips instantáneos de navegación. */}
          <TooltipProvider delayDuration={300}>
            <Sonner />
            <ErrorDetailsDialog />
            <ConfirmProvider>{children}</ConfirmProvider>
          </TooltipProvider>
        </AuthProvider>
        {import.meta.env.DEV ? (
          <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
        ) : null}
      </PersistQueryClientProvider>
    </ThemeProvider>
  );
}
