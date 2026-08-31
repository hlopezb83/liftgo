import { useState } from "react";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import type { Tables } from "@/integrations/supabase/types";
import { STATUS_LABELS } from "@/lib/constants";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { useUpdateInvoice, useDeleteInvoice } from "../invoices/useInvoices";
import { useDownloadInvoiceXml } from "./useDownloadInvoiceXml";
import { useStampInvoiceFlow } from "./useStampInvoiceFlow";

/**
 * Orchestrator hook for InvoiceDetail page actions.
 * Encapsulates dialog state and mutations to keep the page component declarative.
 */
export function useInvoiceDetailActions(invoice: Tables<"invoices"> | undefined, refetch: () => void) {
  const navigate = useNavigateTransition();
  const updateInvoice = useUpdateInvoice();
  const deleteInvoice = useDeleteInvoice();
  const { stampCfdi, run: runStamp, stampError, clearStampError } = useStampInvoiceFlow(refetch);
  const downloadXml = useDownloadInvoiceXml();

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const id = invoice?.id;

  const setStatus = (status: string, paidAt?: string) => {
    if (!id) return;
    updateInvoice.mutate(
      { id, status, ...(paidAt ? { paid_at: paidAt } : {}) },
      {
        onSuccess: () => {
          notifySuccess(`Factura marcada como ${STATUS_LABELS[status] ?? status}`);
          // A3-04: la reserva NO se completa desde aquí. Completar una renta
          // exige la inspección de devolución (guard_booking_completion la
          // rechaza), así que el UPDATE directo sólo generaba un error.
        },
      }
    );
  };

  return {
    cancelDialogOpen, setCancelDialogOpen,
    paymentDialogOpen, setPaymentDialogOpen,
    deleteDialogOpen, setDeleteDialogOpen,
    stampCfdi,
    stampError, clearStampError,
    setStatus,
    handleStamp: () => runStamp(invoice),
    handleDownloadXml: () => downloadXml(invoice),
    handleEdit: () => navigate(`/invoices/${id}/edit`),
    handleDelete: () => {
      if (!id) return;
      deleteInvoice.mutate(id, { onSuccess: () => navigate("/invoices") });
    },
  };
}
