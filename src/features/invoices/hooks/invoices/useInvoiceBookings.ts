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

/** Tamaño de página del pivote (tope típico de PostgREST). */
const PIVOT_PAGE_SIZE = 1000;
/** Tope defensivo: 20 páginas = 20 000 filas de pivote. */
const PIVOT_MAX_PAGES = 20;

/**
 * Todas las filas del pivote para facturas NO canceladas.
 * Se usa para excluir del selector de reservas aquellas ya facturadas.
 * - v7.320.3: antes delegaba en `invoiceBookingQueries.list({})`, que se gatea
 *   con `if (!invoiceId) return []` y por tanto devolvía SIEMPRE `[]` → las
 *   reservas ligadas solo vía pivote nunca se excluían (doble facturación).
 * - Además filtra las filas cuyo invoice está cancelado, para no bloquear
 *   re-facturar una reserva cuya factura anterior se canceló.
 * - Auditoría v2 §3.5: el `select` sin `.limit()` se cortaba en el tope de
 *   PostgREST (~1000 filas) y las reservas antiguas ya facturadas dejaban de
 *   excluirse, reabriendo la doble facturación a escala. Ahora se pagina.
 */
export function useAllInvoiceBookings() {
  return useQuery({
    queryKey: [...invoiceBookingKeys.all, "non-cancelled"],
    queryFn: async () => {
      const rows: { booking_id: string; invoice_id: string }[] = [];
      for (let page = 0; page < PIVOT_MAX_PAGES; page++) {
        const from = page * PIVOT_PAGE_SIZE;
        const { data, error } = await supabase
          .from("invoice_bookings")
          .select("booking_id, invoice_id, invoices!inner(status)")
          .neq("invoices.status", "cancelled")
          .order("invoice_id", { ascending: true })
          .order("booking_id", { ascending: true })
          .range(from, from + PIVOT_PAGE_SIZE - 1);
        if (error) throw error;
        const batch = (data ?? []) as { booking_id: string; invoice_id: string }[];
        rows.push(...batch);
        if (batch.length < PIVOT_PAGE_SIZE) return rows;
      }
      console.warn(
        "[useAllInvoiceBookings] pivote truncado: se alcanzó el tope de páginas; el guard anti-doble-facturación puede estar incompleto.",
      );
      return rows;
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
