import * as Sentry from "@sentry/react";
import { createPrivacyOptions, PUBLIC_SENTRY_DSN, scrubData } from "./privacyOptions";

/** Llamada explícita desde instrument-client.ts, antes de hidratar la aplicación. */
export function initClientSentry(): void {
  const environment = import.meta.env.MODE;
  const dsn = import.meta.env.VITE_SENTRY_DSN ?? PUBLIC_SENTRY_DSN;
  const enabled = environment === "production" || import.meta.env.VITE_SENTRY_FORCE === "1";
  if (typeof window === "undefined" || !dsn || !enabled || environment === "test") return;
  try {
    if (Sentry.getClient()) return;
    Sentry.init(createClientSentryOptions(environment, dsn));
    Sentry.setTag("app", "liftgo-erp");
  } catch { /* El monitoreo no interrumpe la hidratación del ERP. */ }
}

export function createClientSentryOptions(environment: string, dsn: string): Sentry.BrowserOptions {
  return {
    dsn,
    environment,
    release: `liftgo@${import.meta.env.VITE_APP_VERSION ?? "unknown"}`,
    ...createPrivacyOptions(),
    enhanceFetchErrorMessages: "report-only",
    // Perfil de errores: no instrumentar rendimiento ni grabar sesiones.
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    ignoreErrors: ["ResizeObserver loop limit exceeded", "ResizeObserver loop completed with undelivered notifications"],
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === "ui.input" || breadcrumb.category === "ui.click" || breadcrumb.category === "console") return null;
      return scrubData(breadcrumb) as typeof breadcrumb;
    },
  };
}

export { Sentry };
