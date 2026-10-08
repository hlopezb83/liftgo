import { createElement } from "react";
import { toast } from "sonner";
import { ErrorReportActions } from "@/components/feedback/ErrorReportActions";
import type { ErrorCode } from "@/lib/domain/errorCatalog";
import { translatePgError } from "@/lib/errors/pgErrorCatalog";
import { captureOperationalError } from "@/lib/observability/captureOperationalError";
import { closeErrorReport, openErrorReport } from "@/lib/ui/errorDetailsStore";
import { buildErrorReport } from "@/lib/ui/errorReport";
import { redactDiagnosticText } from "@/lib/ui/errorReportJson";

/**
 * Plataforma única de feedback al usuario. Toda la app debe pasar por aquí
 * en lugar de llamar a `toast.*` directamente para garantizar:
 *  - Consistencia visual (border-left semántico, posición, duración).
 *  - Reporte estructurado y trazable en errores (requestId + "Ver detalles").
 *  - Auditoría sencilla (un solo punto donde cambia el comportamiento).
 *
 * Convenciones de copy (es-MX):
 *  - Verbo en pasado + sustantivo. Sin "exitosamente".
 *  - Si hay folio/ID disponible, incluirlo: "Factura FAC-0001 creada".
 *  - Errores de validación: usar `notifyValidation`, no `notifyError`.
 */

const DURATION = {
  success: 3500,
  info: 4000,
  warning: 6000,
  validation: 5000,
  errorWarning: 6000,
  errorCritical: Infinity,
} as const;

/**
 * Etiquetas amigables para pasos numerados de formularios multi-step.
 */
const STEP_LABELS: Record<number, string> = {
  1: "Información general",
  2: "Cliente",
  3: "Equipos",
  4: "Fechas y precio",
  5: "Pagos",
  6: "Confirmación",
};

// ---------------------------------------------------------------------------
// Tipos compartidos
// ---------------------------------------------------------------------------

interface ActionLike {
  label: string;
  onClick: () => void;
}

interface SimpleOpts {
  description?: string;
  action?: ActionLike;
  durationMs?: number;
  /**
   * Clave de deduplicación. Dos toasts con la misma clave se reemplazan en
   * lugar de apilarse (doble clic rápido, reintentos automáticos).
   */
  dedupeKey?: string;
  error?: unknown;
  context?: Record<string, unknown>;
}

/**
 * Deriva un id estable a partir del contenido del toast para que un doble
 * clic no genere dos toasts idénticos. Hash tipo FNV-1a, suficiente para
 * distinguir mensajes sin colisiones prácticas.
 */
function toastDedupeId(kind: string, title: string, description?: string): string {
  const text = `${kind}|${title}|${description ?? ""}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${kind}-${hash.toString(36)}`;
}

/**
 * Hallazgo 3: manejo del toast de error de autenticación. Un intento nuevo
 * de inicio de sesión y el establecimiento de una sesión válida lo descartan
 * para que no sobreviva a un login exitoso.
 *
 * Nota: no se reutiliza un id fijo porque sonner ignora un toast creado con
 * el mismo id de uno recién descartado (el error del segundo intento fallido
 * no se mostraría). Se usa un id único por intento y se rastrea el activo.
 */
const AUTH_SIGNIN_ERROR_PREFIX = "auth-signin-error";
let activeAuthErrorToastId: string | number | null = null;
let authErrorAttempt = 0;

/** Muestra el error de autenticación del intento actual. */
export function notifyAuthError(input: NotifyErrorInput): void {
  authErrorAttempt += 1;
  activeAuthErrorToastId = notifyError({
    ...input,
    dedupeKey: `${AUTH_SIGNIN_ERROR_PREFIX}-${authErrorAttempt}`,
  });
}

/** Descarta el error de autenticación activo (intento nuevo o sesión válida). */
export function dismissAuthError(): void {
  if (activeAuthErrorToastId !== null) {
    toast.dismiss(activeAuthErrorToastId);
    activeAuthErrorToastId = null;
  }
}

/** Clear diagnostics captured for the previous signed-in identity. */
export function dismissNotifications(): void {
  toast.dismiss();
  closeErrorReport();
}

// ---------------------------------------------------------------------------
// notifyError — toast persistente con reporte estructurado
// ---------------------------------------------------------------------------

export interface NotifyErrorInput {
  error?: unknown;
  title?: string;
  description?: string;
  step?: number;
  phase?: string;
  errors?: unknown;
  message?: string;
  context?: Record<string, unknown>;
  errorCode?: ErrorCode;
  method?: string;
  /**
   * Clave de deduplicación. Si se omite se deriva del título + descripción,
   * de modo que dos errores idénticos seguidos ocupan un solo toast.
   */
  dedupeKey?: string;
  /**
   * `critical` (default): duración infinita, requiere clic para cerrar.
   *  Para fallos de runtime, llamadas a backend, errores inesperados.
   * `warning`: 6s, no requiere clic. Para fallos esperables y recuperables
   *  (saldo insuficiente, duplicado, recurso no encontrado por el usuario).
   */
  severity?: "critical" | "warning";
  action?: ActionLike;
}

function resolveTitle(input: NotifyErrorInput): string {
  if (input.title) return input.title;
  if (input.message) return input.message;
  if (typeof input.step === "number") {
    const label = STEP_LABELS[input.step] ?? "Paso";
    return `Revisa el Paso ${input.step}: ${label}`;
  }
  return "No se pudo completar la operación";
}

/**
 * Toast de error con reporte estructurado adjunto. Por defecto es persistente
 * (requiere clic) y muestra el botón "Ver detalles" que abre el diálogo global
 * con el reporte copiable. Usa `severity: "warning"` para errores esperables.
 *
 * Deduplicación: dos llamadas con el mismo contenido (o el mismo `dedupeKey`)
 * reemplazan el toast anterior en vez de apilar uno nuevo.
 */
function errorToast(input: NotifyErrorInput, toastId?: string | number) {
  const title = redactDiagnosticText(resolveTitle(input));
  const error = input.error ?? input.errors ?? input.message ?? title;
  const report = buildErrorReport({
    error,
    title,
    description: input.description,
    phase: input.phase,
    step: input.step,
    method: input.method,
    errorCode: input.errorCode,
    context: input.context,
  });
  captureOperationalError(error, { phase: input.phase, errorCode: report.errorCode, severity: input.severity });

  const translation = translatePgError(error, title);
  // Los errores de negocio de Edge/server functions llegan como texto en español
  // ya redactado para el usuario: se muestran tal cual en lugar del genérico.
  const userFacing = /[áéíóúñ¿¡]|\b(el|la|los|las|no|del|una?)\b/i.test(translation.message);
  const fallback = translation.matched || translation.message === title || userFacing
    ? translation.message
    : "No se confirmó la operación. Actualiza los datos para comprobar el estado del cambio.";
  const detail = redactDiagnosticText(input.description ?? fallback);
  const description = detail === title ? undefined : detail;
  const isCritical = input.severity !== "warning";
  const id = toastId ?? input.dedupeKey ?? toastDedupeId("error", title, description);

  return { title, options: {
    id,
    description,
    duration: isCritical ? DURATION.errorCritical : DURATION.errorWarning,
    closeButton: true,
    action: createElement(ErrorReportActions, { key: report.requestId, report,
      onDetails: () => { toast.dismiss(id); openErrorReport(report); }, extraAction: input.action }),
  } };
}

export function notifyError(input: NotifyErrorInput): string | number {
  const { title, options } = errorToast(input);
  return input.severity === "warning" ? toast.warning(title, options) : toast.error(title, options);
}

// ---------------------------------------------------------------------------
// notifyValidation — toast warning corto para validaciones de formulario
// ---------------------------------------------------------------------------

export interface NotifyValidationInput {
  /** Campo o sección donde está la validación. Se muestra como título. */
  title?: string;
  /** Mensaje principal (qué corregir). */
  message: string;
}

/**
 * Toast para validaciones de formulario, con diagnóstico JSON. Duración
 * corta. Usar cuando el usuario debe corregir un dato
 * antes de continuar.
 */
export function notifyValidation(input: NotifyValidationInput): string | number {
  const title = input.title ?? "Revisa los datos";
  const report = buildErrorReport({ error: input.message, title, phase: "validation", errorCode: "VALIDATION_FAILED" });
  const id = toastDedupeId("validation", title, input.message);
  return toast.warning(report.title, {
    id,
    description: redactDiagnosticText(input.message),
    duration: DURATION.validation,
    action: createElement(ErrorReportActions, { key: report.requestId, report, onDetails: () => { toast.dismiss(id); openErrorReport(report); } }),
  });
}

// ---------------------------------------------------------------------------
// notifySuccess / notifyInfo / notifyWarning — sustitutos de toast.*
// ---------------------------------------------------------------------------

function buildOpts(kind: string, title: string, opts?: SimpleOpts, fallbackDuration?: number) {
  return {
    id: opts?.dedupeKey ?? toastDedupeId(kind, title, opts?.description),
    description: opts?.description,
    action: opts?.action,
    duration: opts?.durationMs ?? fallbackDuration,
  };
}

/**
 * Toast de éxito. Acepta la firma de sonner (`title, opts?`) para que el
 * codemod desde `toast.success` sea mecánico.
 */
export function notifySuccess(title: string, opts?: SimpleOpts): string | number {
  return toast.success(title, buildOpts("success", title, opts, DURATION.success));
}

/**
 * Toast informativo (estados neutrales, "no hay nada que generar", etc.).
 */
export function notifyInfo(title: string, opts?: SimpleOpts): string | number {
  return toast.info(title, buildOpts("info", title, opts, DURATION.info));
}

/**
 * Toast de advertencia (acción riesgosa o resultado parcial). Compatible con
 * la firma anterior `{ title, description }` para no romper llamadas viejas.
 */
export interface NotifySimpleInput {
  title: string;
  description?: string;
  /** Botón opcional dentro del aviso (p. ej. «Ver detalles»). */
  action?: { label: string; onClick: () => void };
  error?: unknown;
  context?: Record<string, unknown>;
}
export function notifyWarning(input: string | NotifySimpleInput, opts?: SimpleOpts): string | number {
  const value = typeof input === "string" ? { title: input, ...opts } : input;
  const report = buildErrorReport({ title: value.title, description: value.description, error: value.error ?? value.description ?? value.title,
    phase: "warning", context: value.context });
  const id = opts?.dedupeKey ?? toastDedupeId("warning", report.title, value.description);
  return toast.warning(report.title, {
    ...buildOpts("warning", report.title, value, DURATION.warning),
    id,
    description: value.description ? redactDiagnosticText(value.description) : undefined,
    duration: opts?.durationMs ?? (value.action ? 10000 : DURATION.warning),
    action: createElement(ErrorReportActions, { key: report.requestId, report,
      onDetails: () => { toast.dismiss(id); openErrorReport(report); }, extraAction: value.action }),
  });
}

// ---------------------------------------------------------------------------
// notifyAsync — toast con estado loading/success/error para operaciones largas
// ---------------------------------------------------------------------------

export interface NotifyAsyncMessages<T> {
  loading: string;
  success: string | ((data: T) => string);
  /**
   * Mensaje de error opcional. Si no se pasa, se intenta extraer del error.
   * Para errores recuperables conviene dejarlo en undefined y manejar el
   * fallo en el `.catch` con `notifyError({ severity: "warning" })`.
   */
  error?: string | ((err: unknown) => string);
}

/**
 * Envoltorio sobre `toast.promise` para operaciones largas (timbrado CFDI,
 * generación de PDF, imports masivos). Muestra spinner mientras corre y se
 * resuelve automáticamente a success/error sin que el caller tenga que
 * orquestar dos toasts.
 *
 * Retorna la misma promesa para que se pueda hacer `await`.
 */
export function notifyAsync<T>(promise: Promise<T>, msgs: NotifyAsyncMessages<T>): Promise<T> {
  const id = crypto.randomUUID();
  toast.promise(promise, {
    id,
    loading: msgs.loading,
    success: (data) => ({ message: typeof msgs.success === "function" ? msgs.success(data) : msgs.success, duration: DURATION.success }),
    error: (err) => {
      const title = typeof msgs.error === "function" ? msgs.error(err) : msgs.error ?? "No se pudo completar la operación";
      const result = errorToast({ error: err, title, phase: "async", context: { operation: msgs.loading } }, id);
      return { message: result.title, description: result.options.description, duration: result.options.duration,
        closeButton: true, action: result.options.action };
    },
  });
  return promise;
}
