import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { STATUS_LABELS } from "@/lib/constants";
import { supabase } from "@/integrations/supabase/client";
import { useUpdateInvoice, useDeleteInvoice } from "@/features/invoices/hooks/invoices/useInvoices";
import { useUpdateBooking } from "@/features/bookings/hooks/useBookings";
import { useStampCfdi } from "@/features/invoices/hooks/invoices/useStampCfdi";
import { getMissingStampFields } from "@/features/invoices/lib/cfdiPrechecks";
import { fetchCfdiBlob, triggerBlobDownload } from "@/features/invoices/lib/downloadCfdiBlob";

import type { Tables } from "@/integrations/supabase/types";

/**
 * Backfill snapshot fiscal del receptor + defaults SAT en facturas antiguas
 * (creadas antes de v6.16.3) que no tienen los campos hidratados.
 * Sólo rellena valores nulos/vacíos; nunca sobrescribe datos existentes.
 */
async function backfillStampSnapshot(invoice: Tables<"invoices">): Promise<Tables<"invoices">> {
  const missing = getMissingStampFields(invoice);
  if (missing.length === 0) return invoice;
  if (!invoice.customer_id) return invoice;

  const { data: customer } = await supabase
    .from("customers")
    .select("rfc, razon_social, name, regimen_fiscal, domicilio_fiscal_cp, uso_cfdi")
    .eq("id", invoice.customer_id)
    .maybeSingle();

  const isEmpty = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
  const patch: Partial<Tables<"invoices">> = {};

  if (customer) {
    if (isEmpty(invoice.receptor_rfc) && customer.rfc) patch.receptor_rfc = customer.rfc;
    const razon = customer.razon_social ?? customer.name;
    if (isEmpty(invoice.receptor_razon_social) && razon) patch.receptor_razon_social = razon;
    if (isEmpty(invoice.receptor_regimen_fiscal) && customer.regimen_fiscal) {
      patch.receptor_regimen_fiscal = customer.regimen_fiscal;
    }
    if (isEmpty(invoice.receptor_domicilio_fiscal_cp) && customer.domicilio_fiscal_cp) {
      patch.receptor_domicilio_fiscal_cp = customer.domicilio_fiscal_cp;
    }
    if (isEmpty(invoice.uso_cfdi) && customer.uso_cfdi) patch.uso_cfdi = customer.uso_cfdi;
  }

  if (isEmpty(invoice.forma_pago)) patch.forma_pago = "99";
  if (isEmpty(invoice.metodo_pago)) patch.metodo_pago = "PPD";
  if (isEmpty(invoice.moneda)) patch.moneda = "MXN";
  if (invoice.tipo_cambio === null || invoice.tipo_cambio === undefined) patch.tipo_cambio = 1;

  if (Object.keys(patch).length === 0) return invoice;

  const { data: updated, error } = await supabase
    .from("invoices")
    .update(patch)
    .eq("id", invoice.id)
    .select()
    .single();

  if (error || !updated) return { ...invoice, ...patch } as Tables<"invoices">;
  return updated;
}

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

  const handleStamp = async () => {
    if (!id || !invoice) return;
    const hydrated = await backfillStampSnapshot(invoice);
    const missing = getMissingStampFields(hydrated);
    if (missing.length > 0) {
      toast.error("Faltan datos para timbrar", {
        description: `Completa en el cliente o en la factura: ${missing.join(", ")}.`,
      });
      refetch();
      return;
    }
    if (hydrated !== invoice) refetch();
    stampCfdi.mutate(id, { onSuccess: () => refetch() });
  };

  const handleDownloadXml = async () => {
    if (!invoice) return;
    const filename = `${invoice.invoice_number}.xml`;
    try {
      const blob = await fetchCfdiBlob({ invoice_id: invoice.id }, "xml");
      triggerBlobDownload(blob, filename);
    } catch (err) {
      if (invoice.cfdi_xml) {
        triggerBlobDownload(new Blob([invoice.cfdi_xml], { type: "application/xml" }), filename);
        return;
      }
      toast.error("Error al descargar XML", {
        description: err instanceof Error ? err.message : "Intenta de nuevo.",
      });
    }
  };

  const handleEdit = () => navigate(`/invoices/${id}/edit`);

  const handleDelete = () => {
    if (!id) return;
    deleteInvoice.mutate(id, { onSuccess: () => navigate("/invoices") });
  };

  return {
    cancelDialogOpen, setCancelDialogOpen,
    paymentDialogOpen, setPaymentDialogOpen,
    deleteDialogOpen, setDeleteDialogOpen,
    stampCfdi,
    setStatus,
    handleStamp,
    handleDownloadXml,
    handleEdit,
    handleDelete,
  };
}
