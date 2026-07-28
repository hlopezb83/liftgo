import type { Tables } from "@/integrations/supabase/types";
import { computeInvoiceVisibility, type InvoiceVisibility } from "./invoiceVisibility";

/**
 * Reglas de dominio para facturas. Combina banderas de acciones (edit/stamp/delete/pago)
 * con `computeInvoiceVisibility` en un solo objeto para consumidores del detalle.
 * Formula única para `isCancelled` / `isStamped`, evita divergencias entre módulos.
 */

type InvoiceLike = Tables<"invoices"> & {
  cancellation_status?: string | null;
  cancellation_motive?: string | null;
  /**
   * v7.226.0 · E2E-N6: saldo real (total − pagos − NCs timbradas). Opcional
   * para retrocompatibilidad; si viene, `showPaymentBtn` respeta el saldo.
   */
  balance?: number | null;
};

type CompanyLike = { facturapi_mode?: string | null } | null | undefined;

export interface InvoiceActionFlags {
  isDraft: boolean;
  isPayable: boolean;
  showPaymentBtn: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canStamp: boolean;
  canCancelCfdi: boolean;
  isStamped: boolean;
  isCancelled: boolean;
  isPendingCancel: boolean;
  isRejectedCancel: boolean;
}

export interface InvoiceFlags extends InvoiceActionFlags {
  visibility: InvoiceVisibility;
}

function computeCfdiFlags(invoice: InvoiceLike, cfdiStatus: string) {
  const cancellationStatus = invoice.cancellation_status ?? "none";
  const hasMotive = Boolean(invoice.cancellation_motive);
  const isStamped = cfdiStatus === "stamped";
  // R-M12: cuando el SAT ya aceptó la cancelación (`cancellation_status = 'accepted'`)
  // debemos tratar la factura como cancelada aunque el `status` / `cfdi_status`
  // no se hayan sincronizado todavía. Antes seguía apareciendo "Cancelar CFDI".
  const isCancelled =
    cfdiStatus === "cancelled" ||
    invoice.status === "cancelled" ||
    cancellationStatus === "accepted";
  const isPendingCancel =
    cancellationStatus === "pending" ||
    (hasMotive && !isCancelled && cancellationStatus !== "rejected");
  return {
    isStamped,
    isCancelled,
    isPendingCancel,
    isRejectedCancel: cancellationStatus === "rejected",
    canStamp: (cfdiStatus === "pending" || cfdiStatus === "error") && invoice.status !== "cancelled",
    // R18-A4 / R-M12: no ofrecer "Cancelar CFDI" si ya se canceló o si la
    // cancelación fue aceptada por el SAT.
    canCancelCfdi: isStamped && !isPendingCancel && !isCancelled,
  };
}

function computeActionFlags(invoice: InvoiceLike, cfdiStatus: string): InvoiceActionFlags {
  const status = invoice.status;
  const isDraft = status === "draft";
  // v7.226.0 · E2E-N6: si el saldo es conocido y ya es <= 0 (NC total o pagos
  // que cubren el remanente), no debe verse "Registrar Pago" aunque el
  // estatus siga como sent/overdue/partial.
  const balanceKnown = typeof invoice.balance === "number";
  const hasBalance = !balanceKnown || (invoice.balance ?? 0) > 0;
  const isPayable = (status === "sent" || status === "overdue") && hasBalance;
  const cfdi = computeCfdiFlags(invoice, cfdiStatus);
  return {
    isDraft,
    isPayable,
    showPaymentBtn: (isPayable || status === "partial") && hasBalance,
    canEdit: isDraft && !cfdi.isStamped && !cfdi.isCancelled,
    canDelete: isDraft && !cfdi.isStamped && !cfdi.isCancelled,
    ...cfdi,
  };
}

export function computeInvoiceFlags(
  invoice: InvoiceLike,
  cfdiStatus: string,
  company: CompanyLike,
): InvoiceFlags {
  return {
    ...computeActionFlags(invoice, cfdiStatus),
    visibility: computeInvoiceVisibility(invoice, company),
  };
}

export type { InvoiceVisibility };
