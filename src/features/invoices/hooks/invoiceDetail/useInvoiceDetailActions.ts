import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { STATUS_LABELS } from "@/lib/constants";
import { useUpdateInvoice, useDeleteInvoice } from "@/features/invoices/hooks/invoices/useInvoices";
import { useUpdateBooking } from "@/features/bookings";
import { useStampInvoiceFlow } from "./useStampInvoiceFlow";
import { useDownloadInvoiceXml } from "./useDownloadInvoiceXml";
import type { Tables } from "@/integrations/supabase/types";

/**
 * Orchestrator hook for InvoiceDetail page actions.
 * Encapsulates dialog state and mutations to keep the page component declarative.
 */
export function useInvoiceDetailActions(invoice: Tables<"invoices"> | undefined, refetch: () => void) {
  const navigate = useNavigate();
  const updateInvoice = useUpdateInvoice();
  const deleteInvoice = useDeleteInvoice();
  const updateBooking = useUpdateBooking();
  const { stampCfdi, run: runStamp } = useStampInvoiceFlow(refetch);
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
        onSuccess: (data) => {
          toast.success(`Factura marcada como ${STATUS_LABELS[status] ?? status}`);
          if (status === "paid" && data.booking_id) {
            updateBooking.mutate(
              { id: data.booking_id, status: "completed" },
              { onSuccess: () => toast.success("Reserva vinculada marcada como completada") }
            );
          }
        },
      }
    );
  };

  return {
    cancelDialogOpen, setCancelDialogOpen,
    paymentDialogOpen, setPaymentDialogOpen,
    deleteDialogOpen, setDeleteDialogOpen,
    stampCfdi,
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
