import * as Sentry from "@sentry/react";
import { scrubEvent, scrubUrl, redactPII } from "./scrubPII";

// DSN público (safe en el bundle). Env var permite deshabilitar en local/preview.
const dsn = import.meta.env.VITE_SENTRY_DSN ??
  "https://e8df6c29317f5f884be32f4b0c50ac05@o4511415732404224.ingest.us.sentry.io/4511770994933760";

const env = import.meta.env.MODE;
// `VITE_APP_VERSION` lo inyecta vite.config.ts (define) leyendo
// public/version.json. Debe coincidir con `release.name` del plugin de Sentry
// para que los sourcemaps subidos hagan match con los eventos en runtime.
const appVersion = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "unknown";
const release = `liftgo@${appVersion}`;

if (dsn && env !== "test") {
  Sentry.init({
    dsn,
    environment: env, // "development" | "production"
    release,
    // Doble candado de PII: (a) no adjuntar automáticamente IP/cookies/headers
    // del navegador; (b) scrubEvent en beforeSend redacta lo que sí adjuntemos.
    sendDefaultPii: false,
    // Traces sólo en producción y a baja tasa; el ERP es interno.
    tracesSampleRate: env === "production" ? 0.1 : 0,
    // Session Replay sólo si hay error, para no consumir cuota.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: env === "production" ? 1.0 : 0,
    integrations: [
      Sentry.browserTracingIntegration(),
      // Defaults ya seguros (maskAllText/maskAllInputs = true, blockAllMedia).
      // Los dejamos explícitos + `networkDetailAllowUrls: []` para que Replay
      // NO capture request/response bodies bajo ninguna URL, y añadimos
      // `mask: ['[data-sentry-mask]']` para que componentes ad-hoc puedan
      // reforzar el masking de zonas visualmente sensibles (montos, folios).
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
        networkDetailAllowUrls: [],
        networkCaptureBodies: false,
        mask: ["[data-sentry-mask]"],
        block: ["[data-sentry-block]"],
      }),
    ],
    // Filtra ruido conocido para no gastar cuota en errores no accionables.
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Failed to fetch dynamically imported module",
      "Importing a module script failed",
    ],
    // Redacta email/RFC/CURP/JWT en `breadcrumb.message` y URLs de navegación
    // ANTES de que Sentry las adjunte al evento. Los eventos de `ui.input`
    // se descartan por completo — el label del input podría contener PII y no
    // aporta información accionable de debug.
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === "ui.input") return null;
      if (breadcrumb.message) breadcrumb.message = redactPII(breadcrumb.message);
      const data = breadcrumb.data as Record<string, unknown> | undefined;
      if (data) {
        for (const key of ["url", "to", "from"] as const) {
          const v = data[key];
          if (typeof v === "string") data[key] = scrubUrl(v);
        }
      }
      return breadcrumb;
    },
    beforeSend(event) {
      // No enviar en localhost salvo que se fuerce con VITE_SENTRY_FORCE=1.
      if (
        env !== "production" &&
        import.meta.env.VITE_SENTRY_FORCE !== "1"
      ) {
        return null;
      }
      return scrubEvent(event);
    },
  });
}

export { Sentry };
