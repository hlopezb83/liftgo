import { useEffect, useState } from "react";

/**
 * Devuelve una versión debounced del valor.
 * Útil para inputs de búsqueda donde no queremos refiltrar en cada keystroke.
 */
export function useDebouncedValue<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
