import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invoiceKeys } from "../../lib/queryKeys";

const ibKeys = {
  all: ["invoice_bookings"] as const,
  byInvoice: (invoiceId: string) => [...ibKeys.all, invoiceId] as const,
};

/** Reservas vinculadas a una factura (tabla pivote). */
export function useInvoiceBookings(invoiceId: string | undefined) {
  return useQuery({
    queryKey: invoiceId ? ibKeys.byInvoice(invoiceId) : ibKeys.all,
    enabled: !!invoiceId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!invoiceId) return [];
      const { data, error } = await supabase
        .from("invoice_bookings")
        .select("invoice_id, booking_id, line_index, bookings(*, forklifts(name, model))")
        .eq("invoice_id", invoiceId)
        .order("line_index", { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

/** Todas las filas de la pivote (para excluir reservas ya facturadas en el selector). */
export function useAllInvoiceBookings() {
  return useQuery({
    queryKey: ibKeys.all,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_bookings")
        .select("invoice_id, booking_id");
      if (error) throw error;
      return data;
    },
  });
}

/** Sincroniza las reservas de una factura (delete + insert). */
export function useSyncInvoiceBookings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ invoiceId, bookingIds }: { invoiceId: string; bookingIds: string[] }) => {
      const { error: delErr } = await supabase
        .from("invoice_bookings")
        .delete()
        .eq("invoice_id", invoiceId);
      if (delErr) throw delErr;
      if (bookingIds.length === 0) return;
      const rows = bookingIds.map((booking_id, line_index) => ({
        invoice_id: invoiceId,
        booking_id,
        line_index,
      }));
      const { error: insErr } = await supabase.from("invoice_bookings").insert(rows);
      if (insErr) throw insErr;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ibKeys.byInvoice(vars.invoiceId) });
      queryClient.invalidateQueries({ queryKey: ibKeys.all });
      queryClient.invalidateQueries({ queryKey: invoiceKeys.all });
    },
  });
}
