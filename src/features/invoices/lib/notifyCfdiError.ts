import { notifyError } from "@/lib/ui/appFeedback";
import { classifyFacturapiError } from "./facturapiErrors";
import { normalizeCfdiErrorText } from "./formatStoredCfdiError";

/**
 * Contexto fiscal que acompaña al reporte copiable del error de timbrado.
 * Todo esto termina en el `ErrorDetailsDialog` para que soporte administrativo
 * lo pegue en un ticket sin pedirle capturas al usuario.
 */
export interface CfdiErrorContext {
  /** Folio del documento (FAC-0001, NC-0007…). */
  folio?: string | null;
  /** RFC del receptor tal como se envió al PAC. */
  receptorRfc?: string | null;
  /** UUID fiscal, cuando ya existe (cancelaciones, complementos). */
  uuid?: string | null;
  /** Operación: "Timbrado", "Cancelación", "Complemento de pago"… */
  phase?: string;
}

export interface NotifyCfdiErrorInput extends CfdiErrorContext {
  error: unknown;
}

function rawTextFrom(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const anyErr = error as { message?: unknown; error?: unknown };
    if (typeof anyErr.message === "string") return anyErr.message;
    if (typeof anyErr.error === "string") return anyErr.error;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error ?? "");
}

/**
 * Toast de error de timbrado con traducción SAT y reporte completo adjunto.
 * El toast muestra el mensaje corto; el payload crudo del PAC nunca se recorta
 * y viaja íntegro dentro del reporte copiable.
 */
export function notifyCfdiError(input: NotifyCfdiErrorInput): string | number {
  const source = normalizeCfdiErrorText(rawTextFrom(input.error));
  const classified = classifyFacturapiError(source);
  const phase = input.phase ?? "Timbrado CFDI";

  const title = classified.title
    ? `${phase}: ${classified.title}`
    : `No se pudo completar el ${phase.toLowerCase()}`;

  return notifyError({
    error: input.error,
    title,
    description: classified.message,
    phase,
    severity: classified.kind === "unknown" ? "critical" : "warning",
    dedupeKey: `cfdi:${input.folio ?? input.uuid ?? "s/folio"}:${classified.code ?? classified.kind}`,
    context: {
      codigoSat: classified.code ?? null,
      tipoDeFalla: classified.kind,
      folio: input.folio ?? null,
      receptorRfc: input.receptorRfc ?? null,
      uuid: input.uuid ?? null,
      respuestaCompletaDelPac: classified.raw,
    },
  });
}
