import type { Tables } from "@/integrations/supabase/types";

/**
 * Reglas únicas de visibilidad para bloques fiscales del detalle de factura:
 * PAC (Sandbox), CFDI PDF/XML, Acuse de cancelación y Complemento de Pago (REP).
 *
 * Ver matriz completa en `.lovable/plan.md`.
 */
export type InvoiceVisibility = {
  /** Botón "PDF borrador" (documento interno). */
  showDraftPdf: boolean;
  /** Botón "CFDI PDF" (documento fiscal timbrado). */
  showCfdiPdf: boolean;
  /** Botón "CFDI XML". */
  showCfdiXml: boolean;
  /** Botones "Acuse PDF/XML". */
  showAcuseButtons: boolean;
  /** La factura está cancelada pero el acuse aún no llega del SAT. */
  showAcuseSyncHint: boolean;
  /** Renderizar la columna REP en el historial de pagos. */
  showRepColumn: boolean;
  /** Permitir Timbrar/Cancelar REP (false si la factura está cancelada). */
  allowRepMutations: boolean;
  /** Chip "Sandbox" en el header. */
  showSandboxChip: boolean;
};

type InvoiceLike = Pick<
  Tables<"invoices">,
  "status" | "cfdi_status" | "metodo_pago"
> & {
  cancellation_status?: string | null;
  facturapi_env?: string | null;
};

type CompanyLike =
  | { facturapi_mode?: string | null }
  | null
  | undefined;

export function computeInvoiceVisibility(
  invoice: InvoiceLike,
  company: CompanyLike,
): InvoiceVisibility {
  const cfdiStatus = invoice.cfdi_status ?? "pending";
  const status = invoice.status;
  const cancellationStatus = invoice.cancellation_status ?? "none";

  const isPpd = invoice.metodo_pago === "PPD";
  const isStamped = cfdiStatus === "stamped";
  const isCancelled = cfdiStatus === "cancelled" || status === "cancelled";
  const hasCfdiDoc = isStamped || isCancelled; // hay CFDI válido descargable
  const isPpd = invoice.metodo_pago === "PPD";

  // Sandbox chip:
  // - Si la factura ya tiene CFDI: usar el ambiente persistido en la factura.
  // - Si aún no tiene CFDI: usar el toggle actual de la empresa como heads-up.
  const invoiceEnv = invoice.facturapi_env ?? null;
  const currentPacMode = company?.facturapi_mode ?? "test";
  const showSandboxChip = hasCfdiDoc
    ? invoiceEnv === "test"
    : currentPacMode !== "live";

  return {
    showDraftPdf: !hasCfdiDoc,
    showCfdiPdf: hasCfdiDoc,
    showCfdiXml: hasCfdiDoc,
    showAcuseButtons: cancellationStatus === "accepted",
    showAcuseSyncHint: isCancelled && cancellationStatus !== "accepted",
    showRepColumn: isPpd && hasCfdiDoc,
    allowRepMutations: isPpd && isStamped && !isCancelled,
    showSandboxChip,
  };
}
