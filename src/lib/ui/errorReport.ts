import type { ErrorCode } from "@/lib/domain/errorCatalog";
import { getAuthSnapshot } from "@/lib/ui/authSnapshot";
import { extractErrorDetails, deriveErrorCode, type ExtractedErrorDetails } from "@/lib/ui/errorDetailsExtract";

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

/** Versión del app leída del primer entry de /changelog.json (best-effort, sin red). */
let cachedVersion: string | null = null;
export function setAppVersion(version: string): void {
  cachedVersion = version;
}
function getAppVersion(): string {
  return cachedVersion ?? "unknown";
}

function safeUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback determinista por timestamp (no debería ejecutarse en navegadores modernos).
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function currentRoute(): string {
  if (typeof window === "undefined") return "";
  const { pathname, search, hash } = window.location;
  return `${pathname}${search}${hash}`;
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
    title: input.title,
    description: input.description,
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
    errorDetails: details,
    context: input.context,
  };
}
