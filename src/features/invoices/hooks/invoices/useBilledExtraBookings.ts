import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { hasNonRentalLines } from "@/lib/domain/nonRentalLines";
import { LIST_FETCH_LIMIT } from "@/lib/supabase/constants";
import { invoiceKeys } from "../../lib/queryKeys";

type Row = {
  id: string;
  booking_id: string | null;
  line_items: unknown;
  invoice_bookings: { booking_id: string }[] | null;
};

/**
 * FIX-4: reservas que YA tienen una factura vigente (no cancelada) con
 * partidas extra (seguro / logística / entrega).
 *
 * Sirve únicamente para no volver a pre-cargar esas partidas en una factura
 * manual posterior de la misma reserva. No bloquea nada ni cambia reglas de
 * negocio: el usuario sigue pudiendo agregarlas a mano si corresponde.
 */
export function useBilledExtraBookings() {
  return useQuery({
    queryKey: [...invoiceKeys.all, "billed-extras"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, booking_id, line_items, invoice_bookings(booking_id)")
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(LIST_FETCH_LIMIT);
      if (error) throw error;
      const set = new Set<string>();
      for (const row of (data ?? []) as unknown as Row[]) {
        if (!hasNonRentalLines(row.line_items)) continue;
        if (row.booking_id) set.add(row.booking_id);
        row.invoice_bookings?.forEach((ib) => { if (ib.booking_id) set.add(ib.booking_id); });
      }
      return set;
    },
  });
}
