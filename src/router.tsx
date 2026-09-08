import { createRouter } from "@tanstack/react-router";
import { createAppQueryClient } from "@/lib/query/appQueryClient";
import { SCROLL_TO_TOP_SELECTORS } from "@/lib/routerScroll";
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
    // TS-04: el <main> persistente debe volver a 0 en navegación nueva.
    scrollToTopSelectors: [...SCROLL_TO_TOP_SELECTORS],
    defaultPreloadStaleTime: 0,
    // TS-02: mismo contrato de query string que URLSearchParams.
    parseSearch,
    stringifySearch,
  });

  return router;
};
