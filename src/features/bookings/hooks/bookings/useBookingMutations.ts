import { forkliftKeys } from "@/features/fleet";
import { reportKeys } from "@/features/reports";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";

import { bookingKeys } from "../../lib/queryKeys";

export function useCreateBooking() {
  return useEntityMutation({
    mutationFn: async (booking: Omit<TablesInsert<"bookings">, "booking_number">) => {
      const { data, error } = await supabase.rpc("create_booking", {
        p_forklift_id: booking.forklift_id,
        p_customer_id: booking.customer_id ?? undefined,
        p_customer_name: booking.customer_name ?? undefined,
        p_customer_contact: booking.customer_contact ?? undefined,
        p_start_date: booking.start_date,
        p_end_date: booking.end_date,
        p_recurring_billing: booking.recurring_billing ?? false,
        p_quote_id: booking.quote_id ?? undefined,
      });
      if (error) throw error;
      return data;
    },
    invalidateKeys: [bookingKeys.lists(), bookingKeys.range(), bookingKeys.byForkliftAll(), forkliftKeys.lists(), ["status_logs"] as const, reportKeys.all],

    errorTitle: "Error al crear reserva",
  });
}

/**
 * A5-05: bloqueo optimista opt-in (mismo patrón que M-11a en clientes y R4-25
 * en facturas). El llamador envía `expectedVersion` — el `version` que tenía la
 * reserva al abrir el formulario. Si otro usuario guardó en el intermedio, el
 * trigger `bump_version_optimistic` ya incrementó la columna, el UPDATE afecta
 * 0 filas y abortamos en vez de pisar los cambios ajenos. Sin `expectedVersion`
 * se conserva el comportamiento anterior (cambios de estado internos).
 */
export function useUpdateBooking() {
  return useEntityMutation({
    mutationFn: async ({ id, expectedVersion, ...updates }: TablesUpdate<"bookings"> & {
      id: string;
      expectedVersion?: number | null;
    }) => {
      let q = supabase.from("bookings").update(updates).eq("id", id);
      if (expectedVersion != null) q = q.eq("version", expectedVersion);
      const { data, error } = await q.select();
      if (error) throw error;
      if ((!data || data.length === 0) && expectedVersion != null) {
        // Conflicto real solo si la versión cambió; si coincide, el UPDATE
        // falló por RLS/permisos y no hay que reportar un falso stale_write.
        const { data: still } = await supabase
          .from("bookings").select("version").eq("id", id).maybeSingle();
        if (still && still.version !== expectedVersion) {
          throw new Error("stale_write: otro usuario modificó esta reserva; recarga y vuelve a intentar");
        }
      }
      assertRowsAffected(data, "Actualizar reserva");
      return data[0];
    },

    // R17-E: refrescar también el detalle para que la vista de reserva vea
    // cambios (status, fechas, contactos) sin necesidad de F5.
    // M-17: `byForkliftAll()` cubre la key ["bookings","forklift",id] que
    // usa useBookings(forkliftId) — lists()/range() no la alcanzan.
    invalidateKeys: [bookingKeys.lists(), bookingKeys.range(), bookingKeys.byForkliftAll(), reportKeys.all],
    invalidateKeysFn: (_d, vars) => [bookingKeys.detail(vars.id)],
    errorTitle: "Error al actualizar reserva",
  });
}

export function useDeleteBooking() {
  return useEntityMutation({
    mutationFn: async (bookingId: string) => {
      const { error } = await supabase.rpc("delete_booking", { p_booking_id: bookingId });
      if (error) throw error;
      return bookingId;
    },
    invalidateKeys: [bookingKeys.lists(), bookingKeys.range(), bookingKeys.byForkliftAll(), forkliftKeys.lists(), ["status_logs"] as const, reportKeys.all],
    invalidateKeysFn: (id) => [bookingKeys.detail(id)],
    errorTitle: "Error al eliminar reserva",
  });
}

export function useCancelBooking() {
  return useEntityMutation({
    mutationFn: async (input: string | { bookingId: string; reason?: string | null }) => {
      const bookingId = typeof input === "string" ? input : input.bookingId;
      const reason = typeof input === "string" ? undefined : (input.reason?.trim() || undefined);
      const { error } = await supabase.rpc("cancel_booking", {
        p_booking_id: bookingId,
        p_reason: reason,
      });
      if (error) throw error;
      return bookingId;
    },
    invalidateKeys: [bookingKeys.lists(), bookingKeys.range(), bookingKeys.byForkliftAll(), forkliftKeys.lists(), ["status_logs"] as const, reportKeys.all],
    invalidateKeysFn: (id) => [bookingKeys.detail(id)],
    errorTitle: "Error al cancelar reserva",
  });
}
