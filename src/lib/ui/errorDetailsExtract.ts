import { ERROR_CODES, type ErrorCode } from "@/lib/domain/errorCatalog";

/** Detalle de un error de validación Zod normalizado. */
export interface ValidationErrorDetail {
  path: string;
  message: string;
  code: string;
}

/** Forma canónica del error después de extraerlo. */
export interface ExtractedErrorDetails {
  message: string;
  name?: string;
  code?: string;
  status?: number;
  details?: string;
  hint?: string;
  stack?: string;
  validationErrors?: ValidationErrorDetail[];
}

interface PostgrestLike {
  message: string;
  details?: string | null;
  hint?: string | null;
  code?: string | null;
}

interface ZodIssueLike {
  path: Array<string | number>;
  message: string;
  code: string;
}

interface ZodErrorLike {
  name: "ZodError";
  issues: ZodIssueLike[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPostgrestError(value: unknown): value is PostgrestLike {
  if (!isObject(value)) return false;
  return typeof value.message === "string" && ("hint" in value || "details" in value || "code" in value);
}

function isZodError(value: unknown): value is ZodErrorLike {
  if (!isObject(value)) return false;
  return value.name === "ZodError" && Array.isArray(value.issues);
}

function isResponse(value: unknown): value is Response {
  return typeof Response !== "undefined" && value instanceof Response;
}

function detailsFromError(error: Error): ExtractedErrorDetails {
  const out: ExtractedErrorDetails = {
    message: error.message,
    name: error.name,
    stack: error.stack,
  };
  const cause = (error as Error & { cause?: unknown }).cause;
  if (isZodError(cause)) {
    out.validationErrors = cause.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
      code: i.code,
    }));
  }
  if (isObject(error)) {
    const pg = error as unknown as Partial<PostgrestLike> & { status?: number };
    if (pg.code) out.code = pg.code;
    if (pg.hint) out.hint = pg.hint;
    if (pg.details) out.details = pg.details;
    if (typeof pg.status === "number") out.status = pg.status;
  }
  return out;
}

function detailsFromZod(error: ZodErrorLike): ExtractedErrorDetails {
  return {
    name: "ZodError",
    message: "Validación fallida",
    validationErrors: error.issues.map((i) => ({
      path: i.path.join("."),
      message: i.message,
      code: i.code,
    })),
  };
}

/** Normaliza cualquier valor `unknown` arrojado a `ExtractedErrorDetails`. */
export function extractErrorDetails(error: unknown): ExtractedErrorDetails {
  if (typeof error === "string") return { message: error };
  if (isZodError(error)) return detailsFromZod(error);
  if (isResponse(error)) {
    return { message: `HTTP ${error.status} ${error.statusText}`, status: error.status };
  }
  if (error instanceof Error) return detailsFromError(error);
  if (isPostgrestError(error)) {
    return {
      message: error.message,
      code: error.code ?? undefined,
      hint: error.hint ?? undefined,
      details: error.details ?? undefined,
    };
  }
  if (isObject(error) && typeof error.message === "string") return { message: error.message };
  return { message: "Error desconocido" };
}

function codeFromPostgres(d: ExtractedErrorDetails): ErrorCode | null {
  if (d.code === "23505") return ERROR_CODES.DB_UNIQUE_VIOLATION;
  if (d.code === "23503") return ERROR_CODES.DB_FOREIGN_KEY;
  if (d.code === "42501" || d.code === "P0001") return ERROR_CODES.DB_PERMISSION_DENIED;
  if (d.message && /row-level security|RLS|permission denied/i.test(d.message)) {
    return ERROR_CODES.DB_PERMISSION_DENIED;
  }
  return null;
}

const HTTP_STATUS_CODES: Record<number, ErrorCode> = {
  401: ERROR_CODES.AUTH_REQUIRED,
  403: ERROR_CODES.DB_PERMISSION_DENIED,
  404: ERROR_CODES.NOT_FOUND,
  429: ERROR_CODES.RATE_LIMITED,
};

function codeFromHttp(d: ExtractedErrorDetails): ErrorCode | null {
  if (typeof d.status !== "number") return null;
  if (HTTP_STATUS_CODES[d.status]) return HTTP_STATUS_CODES[d.status];
  if (d.status >= 500) return ERROR_CODES.INTERNAL_ERROR;
  return null;
}

function codeFromMessage(d: ExtractedErrorDetails): ErrorCode | null {
  if (!d.message) return null;
  if (/failed to fetch|networkerror|load failed/i.test(d.message)) return ERROR_CODES.NETWORK_ERROR;
  const m = d.message.toLowerCase();
  if (m.includes("overlap") || m.includes("ya está reservado")) return ERROR_CODES.BOOKING_OVERLAP;
  if (m.includes("público en general")) return ERROR_CODES.QUOTE_GENERIC_CUSTOMER;
  if (m.includes("facturapi")) return ERROR_CODES.CFDI_FACTURAPI_ERROR;
  return null;
}

/** Mapea un error a un código del catálogo. */
export function deriveErrorCode(error: unknown): ErrorCode {
  const d = extractErrorDetails(error);
  if (d.validationErrors && d.validationErrors.length > 0) return ERROR_CODES.VALIDATION_FAILED;
  return codeFromPostgres(d) ?? codeFromHttp(d) ?? codeFromMessage(d) ?? ERROR_CODES.UNKNOWN;
}
