/**
 * `usePrefetchOnHover` — patrón "prefetch on intent" para TanStack Query.
 *
 * Devuelve handlers `onMouseEnter` / `onFocus` que precalientan la cache
 * con `queryClient.prefetchQuery` cuando el usuario indica intención de
 * navegar (hover 120ms, focus por teclado). Cuando la navegación
 * finalmente ocurre, la query ya está resuelta en cache y la ruta destino
 * pinta al instante.
 *
 * Uso:
 *   const prefetch = usePrefetchOnHover(() => quoteQueries.detail(quote.id));
 *   <TableRow {...prefetch} onClick={() => navigate(`/quotes/${quote.id}`)} />
 */
import { useQueryClient, type FetchQueryOptions } from "@tanstack/react-query";
import { useRef } from "react";

const HOVER_DELAY_MS = 120;

export function usePrefetchOnHover<T>(
  optionsFactory: () => FetchQueryOptions<T>,
) {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const armedRef = useRef(false);

  const arm = () => {
    if (armedRef.current) return;
    timerRef.current = setTimeout(() => {
      armedRef.current = true;
      void queryClient.prefetchQuery(optionsFactory());
    }, HOVER_DELAY_MS);
  };

  const disarm = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = undefined;
  };

  return {
    onMouseEnter: arm,
    onMouseLeave: disarm,
    onFocus: arm,
    onBlur: disarm,
  };
}
