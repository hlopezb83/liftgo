import { StatusBadge } from "@/components/feedback/StatusBadge";

type Tone = "neutral" | "info" | "success" | "warning" | "destructive";

// V07/V10: mismo lenguaje visual que StatusBadge (punto + texto en foreground).
// Sólo se elige la clave de estilo por tono; etiqueta y precedencias siguen
// resueltas por resolveFiscalBadge.
const toneStatus: Record<Tone, string> = {
  neutral: "draft",
  info: "sent",
  success: "paid",
  warning: "pending",
  destructive: "error",
};

interface Props {
  invoiceStatus: string;
  cfdiStatus: string;
  cancellationStatus?: string | null;
  showSandboxChip: boolean;
  /** R2 (bajo 7): CFDI timbrado pero el XML aún no se ha recuperado del PAC. */
  cfdiXmlPending?: boolean;
}

function resolveFiscalBadge(
  invoiceStatus: string,
  cfdiStatus: string,
  cancellationStatus: string | null | undefined,
): { label: string; tone: Tone } {
  if (invoiceStatus === "draft") return { label: "Borrador", tone: "neutral" };
  // R-M12: si el SAT aceptó la cancelación, la factura es "Cancelada"
  // aunque `invoice.status` / `cfdi_status` aún no se sincronicen.
  if (
    cfdiStatus === "cancelled" ||
    invoiceStatus === "cancelled" ||
    cancellationStatus === "accepted"
  ) {
    return { label: "Cancelada", tone: "destructive" };
  }
  if (cancellationStatus === "pending") {
    return { label: "Cancelación en proceso", tone: "warning" };
  }
  // R7 Bloque 11: exponer estados intermedios del ciclo de timbrado.
  if (cfdiStatus === "stamping") return { label: "Timbrando…", tone: "warning" };
  if (cfdiStatus === "error") return { label: "Error de timbrado", tone: "destructive" };
  if (cfdiStatus === "stamped") {
    if (invoiceStatus === "paid") return { label: "Pagada", tone: "success" };
    if (invoiceStatus === "partial") return { label: "Parcial", tone: "warning" };
    if (invoiceStatus === "overdue") return { label: "Vencida", tone: "destructive" };
    // Oleada 1 (A-4): mismo tratamiento verde que la lista (un solo lenguaje)
    return { label: "Timbrada", tone: "success" };
  }
  return { label: "Pendiente de timbrado", tone: "warning" };
}

export function InvoiceDetailBadges({
  invoiceStatus,
  cfdiStatus,
  cancellationStatus,
  showSandboxChip,
  cfdiXmlPending,
}: Props) {
  const fiscal = resolveFiscalBadge(invoiceStatus, cfdiStatus, cancellationStatus);
  return (
    <>
      <span data-tone={fiscal.tone}><StatusBadge status={toneStatus[fiscal.tone]} label={fiscal.label} /></span>
      {cfdiXmlPending && (
        <span data-tone="warning"><StatusBadge status={toneStatus.warning} label="XML por recuperar" /></span>
      )}
      {showSandboxChip && <span data-tone="warning"><StatusBadge status={toneStatus.warning} label="Sandbox" /></span>}
    </>
  );
}
