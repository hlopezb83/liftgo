import { useEffect } from "react";
import { useDebounceValue } from "usehooks-ts";

/**
 * Devuelve una versión debounced del valor.
 * Útil para inputs de búsqueda donde no queremos refiltrar en cada keystroke.
 *
 * Envoltura sobre `useDebounceValue` de `usehooks-ts` que preserva la API
 * histórica `useDebouncedValue(value, delay) => debounced`.
 */
export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useDebounceValue<T>(value, delay);
  useEffect(() => {
    setDebounced(value);
  }, [value, setDebounced]);
  return debounced;
}
