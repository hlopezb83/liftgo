/**
 * `defineEntityQueries` — helper que combina `createEntityKeys` con el
 * idiom oficial `queryOptions()` de TanStack Query v5.
 *
 * Devuelve un contrato tipado, colocalizado y reutilizable entre
 * `useQuery`, `useSuspenseQuery`, `queryClient.prefetchQuery` y
 * `queryClient.ensureQueryData`. Elimina la duplicación de `queryKey`
 * junto a cada `queryFn` y garantiza que la key SIEMPRE proviene del
 * factory (no strings crudos).
 *
 * Ejemplo:
 *   export const quoteQueries = defineEntityQueries("quotes", {
 *     list: () => async () => { ... return rows; },
 *     detail: (id: string) => async () => { ... return row; },
 *   });
 *
 *   // Consumidor:
 *   const { data } = useQuery(quoteQueries.list());
 *   const { data } = useQuery(quoteQueries.detail(id));
 *   await queryClient.prefetchQuery(quoteQueries.detail(id));
 */
import { queryOptions, type QueryKey } from "@tanstack/react-query";
import { createEntityKeys, type EntityKeys } from "./createEntityKeys";

type Fetcher<T> = () => Promise<T>;

export interface EntityQueries<Root extends string, TList, TDetail> {
  readonly keys: EntityKeys<Root>;
  readonly list: (filter?: Readonly<Record<string, unknown>>) => ReturnType<
    typeof queryOptions<TList, Error, TList, QueryKey>
  >;
  readonly detail: (id: string) => ReturnType<
    typeof queryOptions<TDetail, Error, TDetail, QueryKey>
  >;
}

export interface DefineEntityConfig<TList, TDetail> {
  readonly list: (filter?: Readonly<Record<string, unknown>>) => Fetcher<TList>;
  readonly detail: (id: string) => Fetcher<TDetail>;
  /** staleTime por default en ms (default: 60_000). */
  readonly staleTime?: number;
}

export function defineEntityQueries<Root extends string, TList, TDetail>(
  root: Root,
  config: DefineEntityConfig<TList, TDetail>,
): EntityQueries<Root, TList, TDetail> {
  const keys = createEntityKeys(root);
  const staleTime = config.staleTime ?? 60_000;

  return {
    keys,
    list: (filter) =>
      queryOptions({
        queryKey: filter ? keys.byFilter(filter) : keys.lists(),
        queryFn: config.list(filter),
        staleTime,
      }),
    detail: (id) =>
      queryOptions({
        queryKey: keys.detail(id),
        queryFn: config.detail(id),
        staleTime,
        enabled: !!id,
      }),
  };
}
