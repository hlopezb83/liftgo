/**
 * `useOptimisticListMutation` — extensión de `useEntityMutation` con el
 * pipeline oficial de TanStack Query v5 para optimistic updates sobre
 * listas: **snapshot → mutate → onError rollback → onSettled invalidate**.
 *
 * Elimina el patrón manual de `queryClient.setQueryData` disperso en la
 * app y garantiza rollback consistente si la mutación falla.
 *
 * Ejemplo (borrar item de una lista):
 *   const del = useOptimisticListMutation<Quote, string>({
 *     listKey: quoteKeys.lists(),
 *     mutationFn: (id) => callRpc("delete_quote_with_unassign", { p_quote_id: id }),
 *     applyOptimistic: (list, id) => list.filter((q) => q.id !== id),
 *     invalidateKeys: [quoteKeys.all],
 *     errorTitle: "Error al eliminar cotización",
 *   });
 */
import { useMutation, useQueryClient, type QueryKey, type UseMutationResult } from "@tanstack/react-query";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";

export interface UseOptimisticListMutationOptions<TItem, TVar> {
  /** Query key de la LISTA a actualizar optimistamente (ej: `keys.lists()`). */
  listKey: QueryKey;
  /** Ejecuta la mutación real (Supabase/RPC). Debe lanzar en error. */
  mutationFn: (vars: TVar) => Promise<unknown>;
  /** Transforma la lista en caché de forma pura (no mutar). */
  applyOptimistic: (list: readonly TItem[], vars: TVar) => TItem[];
  /** Query keys extra a invalidar en `onSettled` (además de `listKey`). */
  invalidateKeys?: readonly QueryKey[];
  /** Título del toast de error. Requerido. */
  errorTitle: string;
  /** Toast de éxito opcional. */
  successMsg?: string;
}

interface OptimisticContext<TItem> {
  previous: readonly TItem[] | undefined;
}

export function useOptimisticListMutation<TItem, TVar>(
  options: UseOptimisticListMutationOptions<TItem, TVar>,
): UseMutationResult<unknown, Error, TVar, OptimisticContext<TItem>> {
  const queryClient = useQueryClient();
  const { listKey, mutationFn, applyOptimistic, invalidateKeys = [], errorTitle, successMsg } = options;

  return useMutation<unknown, Error, TVar, OptimisticContext<TItem>>({
    mutationFn,
    onMutate: async (vars) => {
      // Cancelamos refetches en vuelo para que no sobrescriban el snapshot optimista.
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<readonly TItem[]>(listKey);
      if (previous) {
        queryClient.setQueryData<readonly TItem[]>(listKey, applyOptimistic(previous, vars));
      }
      return { previous };
    },
    onError: (error, _vars, context) => {
      // Rollback al snapshot.
      if (context?.previous !== undefined) {
        queryClient.setQueryData(listKey, context.previous);
      }
      notifyError({ title: errorTitle, error });
    },
    onSuccess: () => {
      if (successMsg) notifySuccess(successMsg);
    },
    onSettled: async () => {
      // Reconciliamos con el servidor.
      await Promise.all(
        [listKey, ...invalidateKeys].map((key) => queryClient.invalidateQueries({ queryKey: key })),
      );
    },
  });
}
