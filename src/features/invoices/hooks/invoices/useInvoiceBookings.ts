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

/**
 * Todas las filas del pivote para facturas NO canceladas.
 * Se usa para excluir del selector de reservas aquellas ya facturadas.
 * - v7.320.3: antes delegaba en `invoiceBookingQueries.list({})`, que se gatea
 *   con `if (!invoiceId) return []` y por tanto devolvía SIEMPRE `[]` → las
 *   reservas ligadas solo vía pivote nunca se excluían (doble facturación).
 * - Además filtra las filas cuyo invoice está cancelado, para no bloquear
 *   re-facturar una reserva cuya factura anterior se canceló.
 */
export function useAllInvoiceBookings() {
  return useQuery({
    queryKey: [...invoiceBookingKeys.all, "non-cancelled"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoice_bookings")
        .select("booking_id, invoice_id, invoices!inner(status)")
        .neq("invoices.status", "cancelled");
      if (error) throw error;
      return (data ?? []) as { booking_id: string; invoice_id: string }[];
    },
  });
}

/** Sincroniza las reservas de una factura (delete + insert). */
export function useSyncInvoiceBookings() {
  return useEntityMutation({
    mutationFn: async ({ invoiceId, bookingIds }: { invoiceId: string; bookingIds: string[] }) => {
      // PERF-003 / robustez: `.select("invoice_id")` para observar filas afectadas.
      // El delete puede retornar 0 legítimamente (primer sync); no assert aquí.
      const { error: delErr } = await supabase
        .from("invoice_bookings")
        .delete()
        .eq("invoice_id", invoiceId)
        .select("invoice_id");
      if (delErr) throw delErr;
      if (bookingIds.length === 0) return { invoiceId };
      const rows = bookingIds.map((booking_id, line_index) => ({
        invoice_id: invoiceId,
        booking_id,
        line_index,
      }));
      const { data: inserted, error: insErr } = await supabase
        .from("invoice_bookings")
        .insert(rows)
        .select("invoice_id");
      if (insErr) throw insErr;
      // Si RLS o un trigger silenciaron el insert, detectarlo aquí y no en la UI.
      if (!inserted || inserted.length !== rows.length) {
        throw new Error(
          `Sincronizar reservas: se esperaban ${rows.length} filas, se insertaron ${inserted?.length ?? 0}.`,
        );
      }
      return { invoiceId };
    },
    invalidateKeys: [invoiceBookingKeys.all, invoiceKeys.all],
    invalidateKeysFn: (_data, vars) => [invoiceBookingKeys.byInvoice(vars.invoiceId)],
    errorTitle: "Error al sincronizar reservas",
  });
}
