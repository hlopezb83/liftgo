import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";

type InvoiceBookingRow = {
  invoice_id: string;
  booking_id: string;
  line_index: number;
  bookings: Record<string, unknown> | null;
};

const invoiceBookingQueries = defineEntityQueries<"invoice_bookings", InvoiceBookingRow[]>(
  "invoice_bookings",
  {
    list: (filter) => async () => {
      const invoiceId = filter?.invoiceId as string | undefined;
      if (!invoiceId) return [];
      const { data, error } = await supabase
        .from("invoice_bookings")
        .select("invoice_id, booking_id, line_index, bookings(*, forklifts(name, model))")
        .eq("invoice_id", invoiceId)
        .order("line_index", { ascending: true });
      if (error) throw error;
      return (data ?? []) as InvoiceBookingRow[];
    },
  },
);

/** Reservas vinculadas a una factura (tabla pivote). */
export function useInvoiceBookings(invoiceId: string | undefined) {
  return useQuery({
    ...invoiceBookingQueries.list({ invoiceId: invoiceId ?? null }),
    enabled: !!invoiceId,
  });
}

// Regresión v7.423.0 (P1): `useSyncInvoiceBookings` se eliminó. Crear/editar
// la factura y ligar sus reservas ya NO son dos peticiones: todo pasa por el
// RPC transaccional `save_invoice_with_bookings` (ver `useInvoices.ts`), que
// llama a `sync_invoice_bookings` DENTRO de la misma transacción — un fallo
// del sync revierte también la factura (cero facturas parciales/huérfanas).
