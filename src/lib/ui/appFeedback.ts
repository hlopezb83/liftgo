import { toast } from "sonner";
import { buildErrorReport } from "@/lib/ui/errorReport";
import { openErrorReport } from "@/lib/ui/errorDetailsStore";
import { getErrorMessage } from "@/lib/errors";
import type { ErrorCode } from "@/lib/domain/errorCatalog";

/**
 * Etiquetas amigables para pasos numerados de formularios multi-step.
 */
export const STEP_LABELS: Record<number, string> = {
  1: "Información general",
  2: "Cliente",
  3: "Equipos",
  4: "Fechas y precio",
  5: "Pagos",
  6: "Confirmación",
};

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
}

function resolveTitle(input: NotifyErrorInput): string {
  if (input.title) return input.title;
  if (typeof input.step === "number") {
    const label = STEP_LABELS[input.step] ?? "Paso";
    return `Revisa el Paso ${input.step}: ${label}`;
  }
  if (input.phase) return `Error: ${input.phase}`;
  return "Error";
}

/**
 * Toast persistente de error con reporte estructurado adjunto. El botón
 * "Ver detalles" abre el diálogo global con el reporte copiable.
 */
export function notifyError(input: NotifyErrorInput): string | number {
  const title = resolveTitle(input);
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

  const description = input.description ?? getErrorMessage(error);

  return toast.error(title, {
    description,
    duration: Infinity,
    closeButton: true,
    className: "liftgo-toast-error",
    action: {
      label: "Ver detalles",
      onClick: () => openErrorReport(report),
    },
  });
}

export interface NotifySimpleInput {
  title: string;
  description?: string;
}

export function notifyWarning(input: NotifySimpleInput): string | number {
  return toast.warning(input.title, {
    description: input.description,
    className: "liftgo-toast-warning",
  });
}


