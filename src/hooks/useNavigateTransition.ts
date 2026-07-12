import { startTransition, useCallback } from "react";
import { useNavigate, type NavigateOptions, type To } from "react-router";

/**
 * Wrapper de `useNavigate` que envuelve la navegación en `startTransition`
 * para que React 19 pueda mantener la UI actual interactiva mientras la
 * ruta destino monta (Suspense, lazy chunks, queries pesadas).
 *
 * Uso idéntico a `useNavigate()`:
 *   const navigate = useNavigateTransition();
 *   navigate("/reports");
 *   navigate(-1);
 */
export function useNavigateTransition() {
  const navigate = useNavigate();

  return useCallback(
    (to: To | number, options?: NavigateOptions) => {
      startTransition(() => {
        if (typeof to === "number") {
          navigate(to);
        } else {
          navigate(to, options);
        }
      });
    },
    [navigate],
  );
}
