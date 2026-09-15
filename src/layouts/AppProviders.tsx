import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { ThemeProvider } from "next-themes";
import { ConfirmProvider } from "@/components/feedback/ConfirmProvider";
import { ErrorDetailsDialog } from "@/components/ui/ErrorDetailsDialog";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { OrganizationProvider } from "@/contexts/OrganizationContext";
import { AuthSnapshotSync } from "@/features/users";
import { IdentityScopedPersistence } from "@/lib/query/IdentityScopedPersistence";
import { AuthQueryCacheSync } from "@/lib/ui/AuthQueryCacheSync";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

/**
 * Multi-organización (tramo 2): la persistencia ya no se monta globalmente.
 * `IdentityScopedPersistence` restaura y guarda la caché por identidad
 * verificada (usuario + organización del servidor) y limpia la anterior antes
 * de renderizar contenido.
 */
export function AppProviders({ queryClient, children }: { queryClient: QueryClient; children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem storageKey="forklift-theme">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <OrganizationProvider>
            <AuthQueryCacheSync />
            <AuthSnapshotSync />
            {/* Delay global acordado (300ms): único TooltipProvider de la app.
                Excepción deliberada: el sidebar mantiene su propio provider con
                delayDuration={0} para tooltips instantáneos de navegación. */}
            <TooltipProvider delayDuration={300}>
              <Sonner />
              <ErrorDetailsDialog />
              <IdentityScopedPersistence>
                <ConfirmProvider>{children}</ConfirmProvider>
              </IdentityScopedPersistence>
            </TooltipProvider>
          </OrganizationProvider>
        </AuthProvider>
        {import.meta.env.DEV ? (
          <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
        ) : null}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
