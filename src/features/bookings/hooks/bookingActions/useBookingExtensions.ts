import { useQuery } from "@tanstack/react-query";
import { forkliftKeys } from "@/features/fleet";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { bookingKeys } from "../../lib/queryKeys";

const sel = (s: string): string => s;

const BOOKING_EXTENSION_COLUMNS = sel(
  "id, booking_id, original_end_date, new_end_date, reason, created_at, invoice_id, billed_at, pending_invoice_id",
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

/** Estados de factura que ya cuentan como emitida (no borrador, no cancelada). */
export function isIssuedInvoiceStatus(status: string | null | undefined): boolean {
  return !!status && status !== "draft" && status !== "cancelled";
}

/**
 * Bloque 1 · G: la extensión sólo se marca como facturada cuando la factura ya
 * está emitida y no cancelada. Mientras la factura sea borrador se reserva en
 * `pending_invoice_id` y el trigger de BD la liga (invoice_id + billed_at) de
 * forma atómica al emitirla. El guard de BD impide re-vincular una extensión
 * ya facturada (protección contra doble cobro).
 */
export function useLinkExtensionInvoice() {
  return useEntityMutation({
    mutationFn: async (vars: { extensionId: string; bookingId: string; invoiceId: string }) => {
      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices")
        .select("id, status, cfdi_status")
        .eq("id", vars.invoiceId)
        .maybeSingle();
      if (invoiceError) throw invoiceError;
      if (!invoice) throw new Error("La factura de la extensión no existe");

      const issued =
        isIssuedInvoiceStatus(invoice.status) && invoice.cfdi_status !== "cancelled";

      // UPDATE condicional: si otra pestaña/proceso ya ligó una factura a esta
      // extensión, `.is("invoice_id", null)` no afecta filas y avisamos.
      const patch = issued
        ? { invoice_id: vars.invoiceId, billed_at: new Date().toISOString() }
        : { pending_invoice_id: vars.invoiceId };
      const { data, error } = await supabase
        .from("booking_extensions")
        .update(patch)
        .eq("id", vars.extensionId)
        .is("invoice_id", null)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("Esta extensión ya fue facturada");
      }
      return { ...vars, issued };
    },
    invalidateKeysFn: (_d, vars) => [bookingKeys.extensions(vars.bookingId), bookingKeys.all],
    errorTitle: "Error al ligar la extensión con la factura",
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
