import { createRouter } from "@tanstack/react-router";
import { createAppQueryClient } from "@/layouts/AppProviders";
import { parseSearch, stringifySearch } from "@/lib/searchSerialization";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Un QueryClient por request (SSR) / por sesión (cliente) con la misma
  // configuración global de errores y persistencia que la app Classic.
  const queryClient = createAppQueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // TS-02: mismo contrato de query string que URLSearchParams.
    parseSearch,
    stringifySearch,
  });

  return router;
};
