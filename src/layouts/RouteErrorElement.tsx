import { useRouteError } from "react-router";
import { ErrorBoundary } from "@/layouts/ErrorBoundary";

/**
 * Adaptador entre el `errorElement` del Data Router de v7 y nuestra
 * `ErrorBoundary` de clase. Re-lanza el error capturado por el router
 * durante el render para que la clase reciba el mismo error, aplique la
 * lógica de recarga de chunks stale y muestre el fallback consistente.
 */
function Rethrow({ error }: { error: unknown }): null {
  throw error instanceof Error ? error : new Error(String(error ?? "Route error"));
}

export function RouteErrorElement() {
  const error = useRouteError();
  return (
    <ErrorBoundary scope="route">
      <Rethrow error={error} />
    </ErrorBoundary>
  );
}
