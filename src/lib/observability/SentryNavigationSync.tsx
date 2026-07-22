import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { deriveFlow, sanitizeRoute } from "@/lib/observability/routeContext";
import { Sentry } from "@/lib/observability/sentry";

/**
 * Emite un breadcrumb `navigation` y actualiza los tags `flow`/`route` en
 * cada cambio de ruta. Debe montarse una sola vez dentro del `RouterProvider`
 * (típicamente en `MainLayout`) para que cualquier error posterior incluya
 * el camino de navegación que lo causó.
 *
 * PII: `sanitizeRoute` reemplaza UUIDs, IDs numéricos y folios (FAC-0094,
 * RSV-0022, …) por placeholders — nunca se envía un identificador de
 * negocio como tag ni en el mensaje del breadcrumb.
 */
export function SentryNavigationSync(): null {
  const location = useLocation();
  const prevRef = useRef<string | null>(null);

  useEffect(() => {
    const to = sanitizeRoute(location.pathname);
    const from = prevRef.current;
    const flow = deriveFlow(location.pathname);

    Sentry.setTag("flow", flow);
    Sentry.setTag("route", to);
    Sentry.setContext("route", {
      flow,
      route: to,
      // `search` puede traer filtros con IDs — dejamos que scrubUrl lo redacte
      // más adelante si aparece en URLs anexadas por otros breadcrumbs.
      hasQuery: location.search.length > 0,
      hasHash: location.hash.length > 0,
    });

    Sentry.addBreadcrumb({
      category: "navigation",
      type: "navigation",
      level: "info",
      message: to,
      data: from ? { from, to } : { to },
    });

    prevRef.current = to;
  }, [location.pathname, location.search, location.hash]);

  return null;
}
