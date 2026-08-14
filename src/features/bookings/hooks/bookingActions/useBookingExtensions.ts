import { useQuery } from "@tanstack/react-query";
import { forkliftKeys } from "@/features/fleet";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { bookingKeys } from "../../lib/queryKeys";

const sel = (s: string): string => s;

const BOOKING_EXTENSION_COLUMNS = sel(
  "id, booking_id, original_end_date, new_end_date, reason, created_at, invoice_id, billed_at",
);

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
 * Extensión individual + contexto de facturación (reserva, cliente y tarifas
 * del equipo). Lo consume el prefill de "Facturar extensión" (v7.307.0).
 */
export type BookingExtensionWithContext = Tables<"booking_extensions"> & {
  bookings: {
    id: string;
    booking_number: string | null;
    customer_id: string | null;
    customer_name: string | null;
    daily_rate: number | null;
    weekly_rate: number | null;
    monthly_rate: number | null;
    recurring_billing: boolean | null;
    forklifts: {
      name: string | null;
      serial_number: string | null;
      daily_rate: number | null;
      weekly_rate: number | null;
      monthly_rate: number | null;
    } | null;
  } | null;
};

export function useBookingExtension(extensionId?: string) {
  return useQuery({
    queryKey: [...bookingKeys.all, "extension", extensionId ?? ""],
    enabled: !!extensionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_extensions")
        .select(
          `${BOOKING_EXTENSION_COLUMNS}, bookings!inner(id, booking_number, customer_id, customer_name, daily_rate, weekly_rate, monthly_rate, recurring_billing, forklifts(name, serial_number, daily_rate, weekly_rate, monthly_rate))`,
        )
        .eq("id", extensionId ?? "")
        .maybeSingle()
        .returns<BookingExtensionWithContext | null>();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Sella la extensión como facturada. El trigger de BD impide re-vincularla a
 * otra factura si ya tenía una (guard contra doble cobro).
 */
export function useMarkExtensionBilled() {
  return useEntityMutation({
    mutationFn: async (vars: { extensionId: string; bookingId: string; invoiceId: string }) => {
      // Fix 5.4: UPDATE condicional — si otra pestaña/proceso ya ligó una
      // factura a esta extensión, `.is("invoice_id", null)` no afecta filas y
      // lanzamos error explícito en vez de dejarlo pasar en silencio.
      const { data, error } = await supabase
        .from("booking_extensions")
        .update({ invoice_id: vars.invoiceId, billed_at: new Date().toISOString() })
        .eq("id", vars.extensionId)
        .is("invoice_id", null)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Esta extensión ya fue facturada");
      }
      return vars;
    },
    invalidateKeysFn: (_d, vars) => [bookingKeys.extensions(vars.bookingId), bookingKeys.all],
    errorTitle: "Error al marcar la extensión como facturada",
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
