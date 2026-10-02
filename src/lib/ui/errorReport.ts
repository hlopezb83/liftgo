import type { ErrorCode } from "@/lib/domain/errorCatalog";
import { getAuthSnapshot } from "@/lib/ui/authSnapshot";
import { extractErrorDetails, deriveErrorCode, type ExtractedErrorDetails } from "@/lib/ui/errorDetailsExtract";
import { diagnosticSnapshot, redactDiagnosticText } from "@/lib/ui/errorReportJson";

/** Reporte estructurado de error, copiable y enviable a soporte. */
export interface ErrorReport {
  requestId: string;
  errorCode: ErrorCode;
  method?: string;
  title: string;
  description?: string;
  phase?: string;
  step?: number;
  version: string;
  timestampIso: string;
  timezone: string;
  route: string;
  user: {
    id: string | null;
    email: string | null;
    organizationId: string | null;
    organizationName: string | null;
    effectiveRole: string | null;
  };
  client: {
    userAgent: string;
    viewport: { width: number; height: number };
    devicePixelRatio: number;
  };
  errorDetails: ExtractedErrorDetails;
  context?: Record<string, unknown>;
}

export interface BuildErrorReportInput {
  error: unknown;
  title: string;
  description?: string;
  phase?: string;
  step?: number;
  method?: string;
  errorCode?: ErrorCode;
  context?: Record<string, unknown>;
}

/** Build version is available on login, platform and failed-provider screens. */
let cachedVersion: string | null = null;
export function setAppVersion(version: string): void {
  cachedVersion = version;
}
function getAppVersion(): string {
  const compiledVersion = import.meta.env.VITE_APP_VERSION;
  return compiledVersion && compiledVersion !== "unknown" ? compiledVersion : cachedVersion ?? "unknown";
}

function safeUuid(): string {
  // `crypto.randomUUID` está disponible en todos los navegadores objetivo del app
  // y en el runtime de Node de las Edge Functions. No requerimos fallback.
  return crypto.randomUUID();
}

function currentRoute(): string {
  if (typeof window === "undefined") return "";
  const { pathname, search, hash } = window.location;
  return redactDiagnosticText(`${pathname}${search}${hash}`);
}

function currentClient(): ErrorReport["client"] {
  if (typeof window === "undefined") {
    return { userAgent: "ssr", viewport: { width: 0, height: 0 }, devicePixelRatio: 1 };
  }
  return {
    userAgent: window.navigator.userAgent,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

export function buildErrorReport(input: BuildErrorReportInput): ErrorReport {
  const details = extractErrorDetails(input.error);
  const code = input.errorCode ?? deriveErrorCode(input.error);
  const snap = getAuthSnapshot();

  return {
    requestId: safeUuid(),
    errorCode: code,
    method: input.method,
    title: redactDiagnosticText(input.title),
    description: input.description ? redactDiagnosticText(input.description) : undefined,
    phase: input.phase,
    step: input.step,
    version: getAppVersion(),
    timestampIso: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    route: currentRoute(),
    user: {
      id: snap.user?.id ?? null,
      email: snap.user?.email ?? null,
      organizationId: snap.organization?.id ?? null,
      organizationName: snap.organization?.name ?? null,
      effectiveRole: snap.role ?? null,
    },
    client: currentClient(),
    errorDetails: diagnosticSnapshot(details) as ExtractedErrorDetails,
    context: input.context ? diagnosticSnapshot(input.context) as Record<string, unknown> : undefined,
  };
}
