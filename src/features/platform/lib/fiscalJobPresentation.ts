import { FISCAL_QUEUE_STATUSES, type FiscalJob } from "@/lib/platformFiscalJobs.types";

export function fiscalJobStatus(job: FiscalJob) {
  return job.removed ? FISCAL_QUEUE_STATUSES.removed : FISCAL_QUEUE_STATUSES[job.state.status];
}
export function fiscalJobMode(mode: FiscalJob["currentMode"]) {
  return mode === "test" ? "Pruebas" : mode === "live" ? "Producción" : "No registrado";
}
export function fiscalJobGuidance(job: FiscalJob) {
  if (job.removed) return "El trabajo fue retirado de la cola. Su historial se conserva.";
  if (!job.documentAvailable) return "El documento ya no está disponible en esta empresa. Requiere revisión.";
  if (job.operation === "stamp" && (job.hasProviderId || job.hasUuid || job.documentStatus === "stamping")) {
    return "Revisa la conciliación del documento antes de repetir un timbrado. Un ID del proveedor sin UUID puede corresponder a una solicitud aceptada aún pendiente.";
  }
  if (job.state.status === "exhausted") return "Se agotaron los intentos de procesamiento. Revisa el documento y el resultado del proveedor antes de reprogramarlo.";
  if (job.state.status === "succeeded") return "El procesamiento terminó; esto no confirma el timbrado o la cancelación. Consulta el estado del documento.";
  return "El trabajo se procesará según su programación. Abrir el historial no ejecuta operaciones fiscales.";
}
