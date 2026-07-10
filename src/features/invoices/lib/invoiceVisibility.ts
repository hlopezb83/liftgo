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

function resolveSandboxChip(invoice: InvoiceLike, company: CompanyLike, hasCfdiDoc: boolean): boolean {
  // Con CFDI ya emitido → ambiente persistido en la factura.
  // Sin CFDI → toggle actual de la empresa como heads-up.
  if (hasCfdiDoc) return (invoice.facturapi_env ?? null) === "test";
  return (company?.facturapi_mode ?? "test") !== "live";
}

export function computeInvoiceVisibility(
  invoice: InvoiceLike,
  company: CompanyLike,
): InvoiceVisibility {
  const cfdiStatus = invoice.cfdi_status ?? "pending";
  const cancellationStatus = invoice.cancellation_status ?? "none";

  const isPpd = invoice.metodo_pago === "PPD";
  const isStamped = cfdiStatus === "stamped";
  const isCancelled = cfdiStatus === "cancelled" || invoice.status === "cancelled";
  const hasCfdiDoc = isStamped || isCancelled;

  return {
    showDraftPdf: !hasCfdiDoc,
    showCfdiPdf: hasCfdiDoc,
    showCfdiXml: hasCfdiDoc,
    showAcuseButtons: cancellationStatus === "accepted",
    showAcuseSyncHint: isCancelled && cancellationStatus !== "accepted",
    showRepColumn: isPpd && hasCfdiDoc,
    allowRepMutations: isPpd && isStamped && !isCancelled,
    showSandboxChip: resolveSandboxChip(invoice, company, hasCfdiDoc),
  };
}
