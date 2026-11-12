import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useRouterState } from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { lazy, Suspense } from "react";
import { PageFallback } from "@/app-routes/RouteSkeletons";
import { ConfirmProvider } from "@/components/feedback/ConfirmProvider";
import { ErrorDetailsDialog } from "@/components/ui/ErrorDetailsDialog";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthQueryCacheSync } from "@/lib/ui/AuthQueryCacheSync";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

const WorkspaceProviders = lazy(() => import("./WorkspaceProviders").then((module) => ({ default: module.WorkspaceProviders })));

/**
 * El ERP restaura caché por identidad empresarial verificada. El Centro de
 * Plataforma usa un cliente en memoria por actor, sin contexto de empresa.
 */
export function AppProviders({ queryClient, children }: { queryClient: QueryClient; children: ReactNode }) {
  const isAuthRoute = useRouterState({ select: (state) => state.matches[state.matches.length - 1]?.routeId === "/auth" });
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem storageKey="forklift-theme">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthQueryCacheSync />
          {/* Delay global acordado (300ms): único TooltipProvider de la app.
              Excepción deliberada: el sidebar mantiene su propio provider con
              delayDuration={0} para tooltips instantáneos de navegación. */}
          <TooltipProvider delayDuration={300}>
            <Sonner />
            <ErrorDetailsDialog />
            {isAuthRoute ? children : (
              <Suspense fallback={<PageFallback />}>
                <WorkspaceProviders><ConfirmProvider>{children}</ConfirmProvider></WorkspaceProviders>
              </Suspense>
            )}
          </TooltipProvider>
        </AuthProvider>
        {import.meta.env.DEV ? (
          <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
        ) : null}
      </QueryClientProvider>
    </ThemeProvider>
  );
}
