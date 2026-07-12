/**
 * `defineEntityQueries` — helper que combina `createEntityKeys` con el
 * idiom oficial `queryOptions()` de TanStack Query v5.
 *
 * Devuelve un contrato tipado, colocalizado y reutilizable entre
 * `useQuery`, `useSuspenseQuery`, `queryClient.prefetchQuery` y
 * `queryClient.ensureQueryData`. La `queryKey` siempre proviene del
 * factory `createEntityKeys` (no strings crudos).
 *
 * Ejemplo:
 *   export const quoteQueries = defineEntityQueries("quotes", {
 *     list: () => async () => { ... return rows; },
 *     detail: (id: string) => async () => { ... return row; },
 *   });
 *
 *   // Consumidor:
 *   useQuery(quoteQueries.list());
 *   useQuery(quoteQueries.detail(id));
 *   await queryClient.prefetchQuery(quoteQueries.detail(id));
 */
import { queryOptions } from "@tanstack/react-query";
import { createEntityKeys, type EntityKeys } from "./createEntityKeys";

type Fetcher<T> = () => Promise<T>;

export interface DefineEntityConfig<TList, TDetail = never, F = Readonly<Record<string, unknown>>> {
  readonly list: (filter?: F) => Fetcher<TList>;
  /** Opcional: hooks sin fetch de detalle solo definen `list`. */
  readonly detail?: (id: string) => Fetcher<TDetail>;
  /** staleTime por default en ms (default: 60_000). */
  readonly staleTime?: number;
}

export function defineEntityQueries<
  Root extends string,
  TList = unknown,
  TDetail = never,
  F extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
>(root: Root, config: DefineEntityConfig<TList, TDetail, F>) {
  const keys: EntityKeys<Root> = createEntityKeys(root);
  const staleTime = config.staleTime ?? 60_000;

  const list = (filter?: F) =>
    queryOptions({
      queryKey: (filter ? keys.byFilter(filter as Readonly<Record<string, unknown>>) : keys.lists()) as readonly unknown[],
      queryFn: config.list(filter),
      staleTime,
    });

  const detail = (id: string) => {
    if (!config.detail) throw new Error(`defineEntityQueries("${root}"): detail no está configurado`);
    const fetcher = config.detail;
    return queryOptions({
      queryKey: keys.detail(id) as readonly unknown[],
      queryFn: fetcher(id),
      staleTime,
      enabled: !!id,
    });
  };

  return { keys, list, detail } as const;
}
