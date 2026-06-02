import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { STATUS_LABELS } from "@/lib/constants";
import { useUpdateInvoice, useDeleteInvoice } from "@/features/invoices/hooks/invoices/useInvoices";
import { useUpdateBooking } from "@/features/bookings/hooks/useBookings";
import { useStampCfdi } from "@/features/invoices/hooks/invoices/useStampCfdi";
import { getMissingStampFields } from "@/features/invoices/lib/cfdiPrechecks";
import { supabase } from "@/integrations/supabase/client";
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

  const handleStamp = async () => {
    if (!id || !invoice) return;

    let working: Tables<"invoices"> = invoice;

    // Auto-hidratar datos fiscales del receptor desde el cliente si faltan
    const needsReceptor =
      !invoice.receptor_rfc ||
      !invoice.receptor_razon_social ||
      !invoice.receptor_regimen_fiscal ||
      !invoice.receptor_domicilio_fiscal_cp ||
      !invoice.uso_cfdi;

    const patch: Record<string, string> = {};

    if (needsReceptor && invoice.customer_id) {
      const { data: customer, error: custErr } = await supabase
        .from("customers")
        .select("rfc, razon_social, name, regimen_fiscal, domicilio_fiscal_cp, uso_cfdi")
        .eq("id", invoice.customer_id)
        .maybeSingle();
      if (custErr || !customer) {
        toast.error("No se pudo cargar el cliente para autocompletar datos fiscales.");
        return;
      }
      if (!invoice.receptor_rfc && customer.rfc) patch.receptor_rfc = customer.rfc;
      if (!invoice.receptor_razon_social) {
        const rs = customer.razon_social || customer.name;
        if (rs) patch.receptor_razon_social = rs;
      }
      if (!invoice.receptor_regimen_fiscal && customer.regimen_fiscal) patch.receptor_regimen_fiscal = customer.regimen_fiscal;
      if (!invoice.receptor_domicilio_fiscal_cp && customer.domicilio_fiscal_cp) patch.receptor_domicilio_fiscal_cp = customer.domicilio_fiscal_cp;
      if (!invoice.uso_cfdi && customer.uso_cfdi) patch.uso_cfdi = customer.uso_cfdi;
    }

    // Defaults razonables para forma/método de pago si faltan
    if (!invoice.forma_pago) patch.forma_pago = "99"; // Por definir
    if (!invoice.metodo_pago) patch.metodo_pago = "PUE"; // Pago en una exhibición

    if (Object.keys(patch).length > 0) {
      const { data: updated, error: upErr } = await supabase
        .from("invoices")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (upErr || !updated) {
        toast.error("No se pudieron autocompletar los datos fiscales.", { description: upErr?.message });
        return;
      }
      working = updated as Tables<"invoices">;
      toast.info("Datos fiscales autocompletados desde el cliente.");
    }

    const missing = getMissingStampFields(working);
    if (missing.length > 0) {
      toast.error("Faltan datos para timbrar", {
        description: `Completa en el cliente o en la factura: ${missing.join(", ")}.`,
      });
      return;
    }
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
