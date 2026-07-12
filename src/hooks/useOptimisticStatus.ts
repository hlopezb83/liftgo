import { useOptimistic, startTransition } from "react";

/**
 * Wrapper genérico sobre `useOptimistic` + `startTransition` para el patrón
 * "cambio de status con mutación async" (feedback, CRM kanban, bookings,
 * mantenimiento). Reemplaza el manejo manual de estado optimista con
 * `queryClient.setQueryData` sin flicker en la UI.
 *
 * Uso:
 * ```ts
 * const [optimistic, setStatus] = useOptimisticStatus(row.status, async (next) => {
 *   await mutation.mutateAsync({ id: row.id, status: next });
 * });
 * ```
 */
export function useOptimisticStatus<T extends string>(
  current: T,
  mutate: (next: T) => Promise<void> | void,
) {
  const [optimistic, apply] = useOptimistic(current, (_prev: T, next: T) => next);

  const setStatus = (next: T) => {
    startTransition(async () => {
      apply(next);
      await mutate(next);
    });
  };

  return [optimistic, setStatus] as const;
}
