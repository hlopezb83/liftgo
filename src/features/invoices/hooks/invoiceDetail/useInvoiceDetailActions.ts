import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { STATUS_LABELS } from "@/lib/constants";
import { useUpdateInvoice, useDeleteInvoice } from "@/features/invoices/hooks/invoices/useInvoices";
import { useUpdateBooking } from "@/features/bookings/hooks/useBookings";
import { useStampCfdi } from "@/features/invoices/hooks/invoices/useStampCfdi";
import { nowMty } from "@/lib/utils";
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
  const stampCfdi = useStampCfdi();

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [paidDate, setPaidDate] = useState<Date>(nowMty());
  const [paidPopoverOpen, setPaidPopoverOpen] = useState(false);

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

  const confirmPaidWithDate = () => {
    setStatus("paid", format(paidDate, "yyyy-MM-dd"));
    setPaidPopoverOpen(false);
  };

  const handleStamp = () => {
    if (!id) return;
    stampCfdi.mutate(id, { onSuccess: () => refetch() });
  };

  const handleDownloadXml = () => {
    if (!invoice?.cfdi_xml) return;
    const blob = new Blob([invoice.cfdi_xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${invoice.invoice_number}.xml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleEdit = () => navigate(`/invoices/${id}/edit`);

  const handleDelete = () => {
    if (!id) return;
    deleteInvoice.mutate(id, { onSuccess: () => navigate("/invoices") });
  };

  return {
    // dialog state
    cancelDialogOpen, setCancelDialogOpen,
    paymentDialogOpen, setPaymentDialogOpen,
    deleteDialogOpen, setDeleteDialogOpen,
    paidDate, setPaidDate,
    paidPopoverOpen, setPaidPopoverOpen,
    // mutations
    stampCfdi,
    // actions
    setStatus,
    confirmPaidWithDate,
    handleStamp,
    handleDownloadXml,
    handleEdit,
    handleDelete,
  };
}
