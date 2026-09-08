import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { handleSessionExpired } from "@/lib/auth/sessionExpiry";
import { notifyError } from "@/lib/ui/appFeedback";

/**
 * Handlers globales: si una query/mutación no marca `meta.silent = true`,
 * mostramos un toast persistente con botón "Ver detalles" que abre el reporte
 * estructurado. Mutaciones/queries que ya manejan su propio error pueden
 * silenciar el global con `meta: { silent: true }`.
 *
 * El QueryClient lo instancia el router (src/router.tsx) para que SSR cree un
 * cliente por request; esta fábrica vive fuera de AppProviders para que ese
 * archivo exporte sólo componentes (Fast Refresh).
 */
export function createAppQueryClient(): QueryClient {
  return new QueryClient({
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
        // G-C3: un JWT vencido cierra sesión y manda al login antes de cualquier toast.
        void handleSessionExpired(error).then((handled) => {
          if (handled || query.meta?.silent) return;
          notifyError({ title: "No se pudo cargar la información", error, phase: "query", method: String(query.queryKey[0] ?? "query") });
        });
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        void handleSessionExpired(error).then((handled) => {
          if (handled || mutation.meta?.silent) return;
          // Si la mutación ya tiene un onError local, dejamos que él maneje el toast.
          if (mutation.options.onError) return;
          notifyError({ error, phase: "mutation" });
        });
      },
    }),
  });
}
