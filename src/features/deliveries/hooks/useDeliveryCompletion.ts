import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { buildCompletionPayload } from "../lib/deliveryDetailHelpers";
import { deliveryKeys, useUpdateDelivery } from "./useDeliveries";

type Delivery = Tables<"deliveries">;
type Booking = { end_date: string };
type Forklift = { name: string };

export type PickupPrompt = {
  delivery: {
    forklift_id: string;
    booking_id: string;
    address: string | null;
    driver_name: string | null;
    driver_phone: string | null;
    hours_reading: number | null;
  };
  bookingEndDate: string;
  forkliftName: string;
};

/**
 * v7.226.1 · extraído de DeliveryDetail para bajar la complejidad ciclomática.
 * Encapsula: firma dialog, horómetro, cálculo de minHours y prompt post-entrega.
 */
export function useDeliveryCompletion(
  delivery: Delivery | undefined,
  siblingDeliveries: Delivery[] | undefined,
  linkedBooking: Booking | null | undefined,
  forklift: Forklift | undefined,
) {
  const updateDelivery = useUpdateDelivery();
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [hoursReading, setHoursReading] = useState("");
  const [pickupPrompt, setPickupPrompt] = useState<PickupPrompt | null>(null);

  const priorDelivery = siblingDeliveries?.find((d) => d.type === "delivery");

  // FIX-R2-06 (03-FIX-07): última lectura global de la unidad (cualquier
  // entrega/recolección previa, no solo la hermana de esta reserva).
  const forkliftId = delivery?.forklift_id ?? null;
  const { data: lastGlobalReading } = useQuery({
    queryKey: [...deliveryKeys.all, "last-hours-reading", forkliftId],
    enabled: forkliftId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deliveries")
        .select("hours_reading")
        .eq("forklift_id", forkliftId as string)
        .not("hours_reading", "is", null)
        // FIX-R3-02: sólo lecturas de entregas realmente completadas y no
        // canceladas; una programada (completed_at NULL) ganaba el orden.
        .not("completed_at", "is", null)
        .neq("status", "cancelled")
        .order("completed_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.hours_reading ?? null;
    },
  });

  // Piso monótono: entrega hermana (pickups) y última lectura global.
  const minHours = (() => {
    const candidates = [
      delivery?.type === "pickup" ? priorDelivery?.hours_reading ?? null : null,
      lastGlobalReading ?? null,
    ].filter((v): v is number => v != null);
    return candidates.length > 0 ? Math.max(...candidates) : null;
  })();

  const promptPickupIfNeeded = (freshHoursReading: number | null) => {
    if (!delivery) return;
    const bookingId = delivery.booking_id;
    if (delivery.type !== "delivery" || !bookingId || !linkedBooking || !forklift) return;
    setPickupPrompt({
      delivery: {
        forklift_id: delivery.forklift_id,
        booking_id: bookingId,
        address: delivery.address,
        driver_name: delivery.driver_name,
        driver_phone: delivery.driver_phone,
        // R17-H: usar el horómetro que acabamos de escribir (viene del payload),
        // no `delivery.hours_reading` que aún es el valor previo en el cache.
        hours_reading: freshHoursReading,
      },
      bookingEndDate: linkedBooking.end_date,
      forkliftName: forklift.name,
    });
  };

  const markComplete = (signature?: string) => {
    if (!delivery) return;
    try {
      const payload = buildCompletionPayload(
        // R6-FE-06 (N6-DIS-07): timestamp UTC real. `nowMty().toISOString()`
        // aplicaba doble offset (Date ya desplazado a MTY re-interpretado como
        // UTC) y completed_at quedaba ~6h antes del instante real.
        delivery.id, new Date().toISOString(), signature, hoursReading, minHours,
      );
      updateDelivery.mutate(payload, {
        onSuccess: () => {
          notifySuccess("Marcado como completado");
          setSignatureOpen(false);
          // R17-H: `payload.hours_reading` es el valor recién persistido.
          const fresh = typeof payload.hours_reading === "number" ? payload.hours_reading : delivery.hours_reading ?? null;
          promptPickupIfNeeded(fresh);
        },
      });
    } catch (err) {
      notifyError({ title: "Horómetro inválido", error: err });
    }
  };

  return {
    signatureOpen, setSignatureOpen,
    hoursReading, setHoursReading,
    pickupPrompt, setPickupPrompt,
    minHours,
    markComplete,
  };
}
