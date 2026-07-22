import { useQuery } from "@tanstack/react-query";
import { forkliftKeys } from "@/features/fleet";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { bookingKeys } from "../../lib/queryKeys";

const sel = (s: string): string => s;

const BOOKING_EXTENSION_COLUMNS = sel("id, booking_id, original_end_date, new_end_date, reason, created_at");

export function useBookingExtensions(bookingId?: string) {
  return useQuery({
    queryKey: bookingId ? bookingKeys.extensions(bookingId) : [...bookingKeys.all, "extensions"],
    enabled: !!bookingId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_extensions")
        .select(BOOKING_EXTENSION_COLUMNS)
        .eq("booking_id", bookingId ?? "")
        .order("created_at", { ascending: false })
        .returns<Tables<"booking_extensions">[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Extiende una reserva vía RPC atómica `extend_booking`.
 * Valida rol, buffer de mantenimiento de 3 días y colisión de ventanas
 * en una sola transacción. Ver Sprint 2 · Ola 2.1 (BL-A5 / BL-A6).
 */
export function useCreateBookingExtension() {
  return useEntityMutation({
    mutationFn: async (ext: {
      booking_id: string;
      original_end_date: string;
      new_end_date: string;
      reason?: string;
    }) => {
      const { data, error } = await supabase.rpc("extend_booking", {
        p_booking_id: ext.booking_id,
        p_new_end_date: ext.new_end_date,
        ...(ext.reason ? { p_reason: ext.reason } : {}),
      });
      if (error) throw error;
      return { id: data ?? undefined, booking_id: ext.booking_id };
    },
    // BL-A2: se invalidan bookings + booking_extensions + fleet — la RPC puede
    // cambiar el estado operativo derivado de la unidad al extender el rango.
    invalidateKeysFn: (_d, vars) => [
      bookingKeys.extensions(vars.booking_id),
      bookingKeys.all,
      forkliftKeys.all,
    ],
    successMsg: "Reserva extendida exitosamente",
    errorTitle: "Error al extender reserva",
  });
}
