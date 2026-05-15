import { useLocation } from "react-router-dom";
import { useChangelog } from "@/features/changelog/hooks/useChangelog";

export interface FeedbackContext {
  route: string;
  viewport: string;
  user_agent: string;
  app_version: string | null;
  captured_at: string;
}

/**
 * Captura el contexto técnico actual para adjuntar a un reporte de feedback.
 * Power of 10: hook simple, sin efectos, ≤80 LOC.
 */
export function useFeedbackContext(): () => FeedbackContext {
  const location = useLocation();
  const { data: changelog } = useChangelog();
  const appVersion = changelog?.[0]?.version ?? null;

  return () => ({
    route: location.pathname + location.search,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    user_agent: navigator.userAgent.slice(0, 300),
    app_version: appVersion,
    captured_at: new Date().toISOString(),
  });
}
