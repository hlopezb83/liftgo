import { scrubData, scrubEvent, scrubSpan } from "./scrubPII";

/** Contratos conocidos completos: texto nuevo o combinado se conserva para revisión. */
const EXPECTED_VALIDATIONS: Readonly<Record<string, readonly string[]>> = {
  LC_COT_VENCIDA: ["", "venció"],
};
const EXPECTED_MESSAGES = [/^invalid login credentials$/i, /^No puedes restablecer la contraseña de un administrador$/i];

function isExpectedMessage(text: string): boolean {
  if (EXPECTED_MESSAGES.some((pattern) => pattern.test(text))) return true;
  const delimiter = text.indexOf(":");
  if (delimiter < 0) return false;
  const code = text.slice(0, delimiter);
  return Object.hasOwn(EXPECTED_VALIDATIONS, code)
    && EXPECTED_VALIDATIONS[code].includes(text.slice(delimiter + 1).trim());
}

/** Sólo errores reales llegan a Sentry; warnings/info y validaciones esperadas se descartan. */
export function isActionableEvent(event: { level?: string; message?: string; exception?: { values?: { value?: string }[] } }): boolean {
  if (event.level && event.level !== "error" && event.level !== "fatal") return false;
  if (event.level === "fatal") return true;
  const texts = [event.message ?? "", ...(event.exception?.values ?? []).map((v) => v.value ?? "")].filter(Boolean);
  return texts.length === 0 || !texts.every(isExpectedMessage);
}

function errorsOnly<T extends Parameters<typeof scrubEvent>[0]>(event: T): T | null {
  return isActionableEvent(event as never) ? scrubEvent(event) : null;
}

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
    beforeSend: errorsOnly,
    beforeSendSpan: scrubSpan,
  };
}

export function scrubServerEvent<T extends Parameters<typeof scrubEvent>[0]>(event: T): T | null {
  if (!isActionableEvent(event as never)) return null;
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
