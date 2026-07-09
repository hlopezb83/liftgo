import type { Tables } from "@/integrations/supabase/types";
import { computeInvoiceVisibility, type InvoiceVisibility } from "@/features/invoices/lib/invoiceVisibility";

/**
 * Reglas de dominio para facturas. Combina banderas de acciones (edit/stamp/delete/pago)
 * con `computeInvoiceVisibility` en un solo objeto para consumidores del detalle.
 * Formula única para `isCancelled` / `isStamped`, evita divergencias entre módulos.
 */

type InvoiceLike = Tables<"invoices"> & {
  cancellation_status?: string | null;
  cancellation_motive?: string | null;
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

function computeActionFlags(invoice: InvoiceLike, cfdiStatus: string): InvoiceActionFlags {
  const status = invoice.status;
  const isDraft = status === "draft";
  const isPayable = status === "sent" || status === "overdue";
  const cancellationStatus = invoice.cancellation_status ?? "none";
  const hasMotive = Boolean(invoice.cancellation_motive);
  const isStamped = cfdiStatus === "stamped";
  const isCancelled = cfdiStatus === "cancelled" || status === "cancelled";
  const isPendingCancel =
    cancellationStatus === "pending" ||
    (hasMotive && !isCancelled && cancellationStatus !== "rejected");
  return {
    isDraft,
    isPayable,
    showPaymentBtn: isPayable || status === "partial",
    canEdit: isDraft && !isStamped && !isCancelled,
    canDelete: isDraft && !isStamped && !isCancelled,
    canStamp: (cfdiStatus === "pending" || cfdiStatus === "error") && status !== "cancelled",
    canCancelCfdi: isStamped && !isPendingCancel,
    isStamped,
    isCancelled,
    isPendingCancel,
    isRejectedCancel: cancellationStatus === "rejected",
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
