import { countLabel } from "@/lib/format/countLabel";

export interface GenerateMaintenanceResponse {
  generated: number;
  skipped: number;
  omitted_by_status?: number;
  month: string;
  details?: string[];
  // Opcionales durante el despliegue de la nueva respuesta del servidor.
  failed_policies?: number;
  pending_remaining?: number;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

export function maintenanceGenerationFeedback(result: GenerateMaintenanceResponse): {
  kind: "success" | "warning" | "info";
  title: string;
  description: string;
} {
  if (!isCount(result.failed_policies) || !isCount(result.pending_remaining)) {
    return {
      kind: "warning",
      title: "Resultado de mantenimiento por revisar",
      description: "El servidor no confirmó el resumen de errores y periodos pendientes. Revisa el detalle antes de volver a generar.",
    };
  }
  const { generated, failed_policies: failed, pending_remaining: pending } = result;
  if (failed > 0 || pending > 0) {
    return {
      kind: "warning",
      title: "Generación de mantenimiento incompleta",
      description: `${countLabel(generated, "registro programado", "registros programados")}; ${failed} ${failed === 1 ? "póliza requiere" : "pólizas requieren"} revisión; ${pending} ${pending === 1 ? "periodo pendiente" : "periodos pendientes"}. Revisa el resultado.`,
    };
  }
  if (generated > 0) {
    return {
      kind: "success",
      title: `${generated} ${generated === 1 ? "registro de mantenimiento programado" : "registros de mantenimiento programados"}`,
      description: "Generar los registros no confirma que el servicio se haya realizado.",
    };
  }
  const omitted = result.omitted_by_status ?? 0;
  return {
    kind: "info",
    title: "No se programaron nuevos registros",
    description: omitted > 0
      ? `${omitted} ${omitted === 1 ? "póliza activa corresponde" : "pólizas activas corresponden"} a unidades no rentadas este mes. Las demás no tienen periodos pendientes.`
      : "Las pólizas revisadas no tienen periodos pendientes de generar.",
  };
}
