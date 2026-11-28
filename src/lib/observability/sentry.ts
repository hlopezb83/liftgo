import * as Sentry from "@sentry/react";
import { createPrivacyOptions, PUBLIC_SENTRY_DSN, scrubData } from "./privacyOptions";
import { resolveSampleRate } from "./sampleRate";
import { isStaleChunkRecoveryPending, recoverFromStaleChunk } from "./staleChunkReload";

const DEFAULT_SENTRY_TUNNEL = "/api/sentry-tunnel";

/** Llamada explícita desde instrument-client.ts, antes de hidratar la aplicación. */
export function initClientSentry(): void {
  const mode = import.meta.env.MODE;
  const environment = import.meta.env.VITE_SENTRY_ENVIRONMENT?.trim() || mode;
  const dsn = import.meta.env.VITE_SENTRY_DSN ?? PUBLIC_SENTRY_DSN;
  const enabled = mode === "production" || import.meta.env.VITE_SENTRY_FORCE === "1";
  if (typeof window === "undefined" || !dsn || !enabled || mode === "test") return;
  try {
    if (Sentry.getClient()) return;
    Sentry.init(createClientSentryOptions(environment, dsn));
    Sentry.setTag("app", "liftgo-erp");
  } catch { /* El monitoreo no interrumpe la hidratación del ERP. */ }
}

/**
 * Una pestaña abierta durante una publicación pide partes que ya no existen y
 * la app se recarga sola. Ese caso recuperado no es un incidente; si la guarda
 * de recargas se agota, el fallo persistente sí se reporta.
 */
function isRecoveredStaleChunkEvent(event: { message?: string; exception?: { values?: { value?: string }[] } }): boolean {
  const texts = [event.message, ...(event.exception?.values ?? []).map((value) => value.value)];
  if (isStaleChunkRecoveryPending() && texts.some((text) => recoverFromStaleChunk(text))) return true;
  return texts.some((text) => recoverFromStaleChunk(text));
}

export function createClientSentryOptions(environment: string, dsn: string): Sentry.BrowserOptions {
  const privacy = createPrivacyOptions();
  const rawTunnel = import.meta.env.VITE_SENTRY_TUNNEL;
  const tunnel = rawTunnel === undefined ? DEFAULT_SENTRY_TUNNEL : (rawTunnel.trim() || undefined);
  const defaultTracesRate = environment === "production" || environment === "preview" ? 0.05 : 0;
  const tracesSampleRate = resolveSampleRate(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE, defaultTracesRate);
  return {
    dsn,
    tunnel,
    environment,
    release: `liftgo@${import.meta.env.VITE_APP_VERSION ?? "unknown"}`,
    ...privacy,
    beforeSend(event) {
      if (isRecoveredStaleChunkEvent(event)) return null;
      return privacy.beforeSend(event);
    },
    enhanceFetchErrorMessages: "report-only",
    // Trazas muestreadas al 5 % en producción/preview (sobrescribible vía VITE_SENTRY_TRACES_SAMPLE_RATE);
    // Session Replay permanece desactivado para conservar privacidad estricta.
    tracesSampleRate,
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
