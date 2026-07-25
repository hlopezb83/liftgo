import { useLocation } from "react-router";

export interface FeedbackContext {
  route: string;
  viewport: string;
  user_agent: string;
  app_version: string | null;
  captured_at: string;
  [key: string]: unknown;
}

/**
 * Captura el contexto técnico actual para adjuntar a un reporte de feedback.
 * Power of 10: hook simple, sin efectos, ≤80 LOC.
 *
 * R-Perf P0-3.3: `app_version` se lee de `VITE_APP_VERSION` (inyectado en build)
 * en vez de `useChangelog()` — evita descargar 132 KB gz de `/changelog.json`
 * solo para adjuntar el string de versión al reporte.
 */
export function useFeedbackContext(): () => FeedbackContext {
  const location = useLocation();
  const appVersion = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? null;

  return () => ({
    route: location.pathname + location.search,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    user_agent: navigator.userAgent.slice(0, 300),
    app_version: appVersion === "unknown" ? null : appVersion,
    captured_at: new Date().toISOString(),
  });
}
