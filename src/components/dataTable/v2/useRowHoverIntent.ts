import { useCallback, useEffect, useRef } from "react";

const PREFETCH_DELAY_MS = 120;

/**
 * Retrasa la intención de hover/foco sobre una fila sin acoplar DataTableV2
 * a `@tanstack/react-query`. Limpia timers pendientes al desmontar o cambiar
 * el callback para evitar disparos fantasma tras cambiar de página o filtro.
 */
export function useRowHoverIntent<T>(onRowHover?: (item: T) => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const arm = useCallback((item: T) => {
    if (!onRowHover) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onRowHover(item);
    }, PREFETCH_DELAY_MS);
  }, [onRowHover]);

  const disarm = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = undefined;
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, [onRowHover]);

  return { arm, disarm };
}
