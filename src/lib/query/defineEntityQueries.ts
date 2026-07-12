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

export interface DefineEntityConfig<TList, TDetail> {
  readonly list: (filter?: Readonly<Record<string, unknown>>) => Fetcher<TList>;
  readonly detail: (id: string) => Fetcher<TDetail>;
  /** staleTime por default en ms (default: 60_000). */
  readonly staleTime?: number;
}

export function defineEntityQueries<Root extends string, TList, TDetail>(
  root: Root,
  config: DefineEntityConfig<TList, TDetail>,
) {
  const keys: EntityKeys<Root> = createEntityKeys(root);
  const staleTime = config.staleTime ?? 60_000;

  const list = (filter?: Readonly<Record<string, unknown>>) =>
    queryOptions({
      queryKey: (filter ? keys.byFilter(filter) : keys.lists()) as readonly unknown[],
      queryFn: config.list(filter),
      staleTime,
    });

  const detail = (id: string) =>
    queryOptions({
      queryKey: keys.detail(id) as readonly unknown[],
      queryFn: config.detail(id),
      staleTime,
      enabled: !!id,
    });

  return { keys, list, detail } as const;
}
