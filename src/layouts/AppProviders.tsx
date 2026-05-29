import type { ReactNode } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { ErrorDetailsDialog } from "@/components/ui/ErrorDetailsDialog";
import { AuthSnapshotSync } from "@/lib/ui/AuthSnapshotSync";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem storageKey="forklift-theme">
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthSnapshotSync />
          <TooltipProvider>
            <Sonner />
            <ErrorDetailsDialog />
            {children}
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
