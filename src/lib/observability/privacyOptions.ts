import { scrubData, scrubEvent, scrubSpan } from "./scrubPII";

export const PUBLIC_SENTRY_DSN = "https://e8df6c29317f5f884be32f4b0c50ac05@o4511415732404224.ingest.us.sentry.io/4511770994933760";

/** Política común; no importa un SDK ni estado de navegador en el servidor. */
export function createPrivacyOptions() {
  return {
    dataCollection: {
      userInfo: false, cookies: false, httpHeaders: false, httpBodies: [],
      urlQueryParams: false, databaseQueryData: false, queues: false,
      stackFrameVariables: false, graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
    },
    beforeSendLog: () => null,
    beforeSendMetric: () => null,
    tracePropagationTargets: [],
    beforeSend: scrubEvent,
    beforeSendSpan: scrubSpan,
  };
}

export function scrubServerEvent<T extends Parameters<typeof scrubEvent>[0]>(event: T): T {
  const clean = scrubEvent(event);
  // Un objeto lanzado puede convertirse en extra.__serialized__. No enviar filas
  // ni payloads arbitrarios del servidor, aunque sus nombres de campo sean nuevos.
  delete clean.extra;
  if (clean.request) {
    delete clean.request.headers;
    delete clean.request.cookies;
    delete clean.request.query_string;
    delete clean.request.data;
  }
  return clean;
}

export { scrubData };
