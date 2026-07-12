import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { defineEntityQueries } from "@/lib/query/defineEntityQueries";
import { invoiceBookingKeys } from "../../lib/queryKeys";
import { invoiceKeys } from "../../lib/queryKeys";

export type InvoiceBookingRow = {
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

/** Todas las filas de la pivote (para excluir reservas ya facturadas en el selector). */
export function useAllInvoiceBookings() {
  return useQuery(invoiceBookingQueries.list({}));
}

/** Sincroniza las reservas de una factura (delete + insert). */
export function useSyncInvoiceBookings() {
  return useEntityMutation({
    mutationFn: async ({ invoiceId, bookingIds }: { invoiceId: string; bookingIds: string[] }) => {
      const { error: delErr } = await supabase
        .from("invoice_bookings")
        .delete()
        .eq("invoice_id", invoiceId);
      if (delErr) throw delErr;
      if (bookingIds.length === 0) return { invoiceId };
      const rows = bookingIds.map((booking_id, line_index) => ({
        invoice_id: invoiceId,
        booking_id,
        line_index,
      }));
      const { error: insErr } = await supabase.from("invoice_bookings").insert(rows);
      if (insErr) throw insErr;
      return { invoiceId };
    },
    invalidateKeys: [invoiceBookingKeys.all, invoiceKeys.all],
    invalidateKeysFn: (_data, vars) => [invoiceBookingKeys.byInvoice(vars.invoiceId)],
    errorTitle: "Error al sincronizar reservas",
  });
}
