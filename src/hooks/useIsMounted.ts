import { useCallback, useEffect, useRef } from "react";

/**
 * Devuelve una función estable que indica si el componente sigue montado.
 * Útil para evitar `setState` después de que la petición async resuelve y el
 * usuario ya navegó fuera (warnings de "memory leak" en React).
 *
 * Uso:
 *   const isMounted = useIsMounted();
 *   mutation.mutate(payload, {
 *     onSuccess: (data) => { if (isMounted()) setState(data); },
 *   });
 */
export function useIsMounted(): () => boolean {
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return useCallback(() => mountedRef.current, []);
}
