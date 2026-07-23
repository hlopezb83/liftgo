import type { Tables } from "@/integrations/supabase/types";

/**
 * Reglas únicas de visibilidad para bloques fiscales del detalle de factura:
 * PAC (Sandbox), CFDI PDF/XML, Acuse de cancelación y Complemento de Pago (REP).
 *
 * Se ubica en `lib/rules` (sin dependencias a `features/`) para que otras capas
 * — incluyendo `lib/pdf` — puedan compartir la matriz sin ciclos.
 */
export type InvoiceVisibility = {
  showDraftPdf: boolean;
  showCfdiPdf: boolean;
  showCfdiXml: boolean;
  showAcuseButtons: boolean;
  showAcuseSyncHint: boolean;
  showRepColumn: boolean;
  allowRepMutations: boolean;
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
