import * as Sentry from "@sentry/react";
import { scrubData, scrubEvent, scrubSpan } from "./scrubPII";

const PUBLIC_DSN = "https://e8df6c29317f5f884be32f4b0c50ac05@o4511415732404224.ingest.us.sentry.io/4511770994933760";
let tracingInstalled = false;

/** Llamada explícita desde client.ts, antes de importar/hidratar la aplicación. */
export function initClientSentry(): void {
  const environment = import.meta.env.MODE;
  const dsn = import.meta.env.VITE_SENTRY_DSN ?? PUBLIC_DSN;
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
    dataCollection: {
      userInfo: false, cookies: false, httpHeaders: false, httpBodies: [],
      urlQueryParams: false, databaseQueryData: false, queues: false,
      stackFrameVariables: false, graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
    },
    beforeSendLog: () => null,
    beforeSendMetric: () => null,
    enhanceFetchErrorMessages: "report-only",
    tracesSampleRate: environment === "production" ? 0.1 : 0,
    tracePropagationTargets: [],
    replaysSessionSampleRate: 0,
    // Opt-in sólo tras verificar privacidad de URL/DOM en la cuenta de Sentry.
    replaysOnErrorSampleRate: environment === "production" && import.meta.env.VITE_SENTRY_REPLAY === "1" ? 1 : 0,
    ignoreErrors: ["ResizeObserver loop limit exceeded", "ResizeObserver loop completed with undelivered notifications"],
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === "ui.input" || breadcrumb.category === "ui.click" || breadcrumb.category === "console") return null;
      return scrubData(breadcrumb) as typeof breadcrumb;
    },
    beforeSend: scrubEvent,
    beforeSendSpan: scrubSpan,
  };
}

/** Se conecta al router real una sola vez; no duplicar browserTracingIntegration. */
export function attachSentryRouter(router: Parameters<typeof Sentry.tanstackRouterBrowserTracingIntegration>[0]): void {
  if (typeof window === "undefined" || !Sentry.getClient() || tracingInstalled) return;
  Sentry.addIntegration(Sentry.tanstackRouterBrowserTracingIntegration(router));
  tracingInstalled = true;
}

export { Sentry };
