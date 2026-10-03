import * as Sentry from "@sentry/react";
import { createPrivacyOptions, PUBLIC_SENTRY_DSN, scrubData } from "./privacyOptions";

let tracingInstalled = false;

/** Llamada explícita desde instrument-client.ts, antes de hidratar la aplicación. */
export function initClientSentry(): void {
  const environment = import.meta.env.MODE;
  const dsn = import.meta.env.VITE_SENTRY_DSN ?? PUBLIC_SENTRY_DSN;
  const enabled = environment === "production" || import.meta.env.VITE_SENTRY_FORCE === "1";
  if (typeof window === "undefined" || !dsn || !enabled || environment === "test" || Sentry.getClient()) return;
  Sentry.init(createClientSentryOptions(environment, dsn));
  Sentry.setTag("app", "liftgo-erp");
  if (environment === "production" && import.meta.env.VITE_SENTRY_REPLAY === "1") {
    const load = () => { void import("./replay").then(({ installReplay }) => installReplay()).catch(() => {
      // Un fallo en Replay no debe romper el ERP ni generar un bucle de errores.
      Sentry.setTag("replay_available", false);
    }); };
    if (window.requestIdleCallback) window.requestIdleCallback(load, { timeout: 3000 });
    else setTimeout(load, 2000);
  }
}

export function createClientSentryOptions(environment: string, dsn: string): Sentry.BrowserOptions {
  return {
    dsn,
    environment,
    release: `liftgo@${import.meta.env.VITE_APP_VERSION ?? "unknown"}`,
    ...createPrivacyOptions(),
    enhanceFetchErrorMessages: "report-only",
    tracesSampleRate: environment === "production" ? 0.1 : 0,
    replaysSessionSampleRate: 0,
    // Opt-in sólo tras verificar privacidad de URL/DOM en la cuenta de Sentry.
    replaysOnErrorSampleRate: environment === "production" && import.meta.env.VITE_SENTRY_REPLAY === "1" ? 1 : 0,
    ignoreErrors: ["ResizeObserver loop limit exceeded", "ResizeObserver loop completed with undelivered notifications"],
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === "ui.input" || breadcrumb.category === "ui.click" || breadcrumb.category === "console") return null;
      return scrubData(breadcrumb) as typeof breadcrumb;
    },
  };
}

/** Se conecta al router real una sola vez; no duplicar browserTracingIntegration. */
export function attachSentryRouter(router: Parameters<typeof Sentry.tanstackRouterBrowserTracingIntegration>[0]): void {
  if (typeof window === "undefined" || !Sentry.getClient() || tracingInstalled) return;
  Sentry.addIntegration(Sentry.tanstackRouterBrowserTracingIntegration(router));
  tracingInstalled = true;
}

export { Sentry };
