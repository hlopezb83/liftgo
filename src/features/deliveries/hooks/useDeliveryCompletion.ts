import { useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import { notifyError, notifySuccess } from "@/lib/ui/appFeedback";
import { nowMty } from "@/lib/utils";
import { buildCompletionPayload } from "../lib/deliveryDetailHelpers";
import { useUpdateDelivery } from "./useDeliveries";

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
  const minHours =
    delivery?.type === "pickup" ? priorDelivery?.hours_reading ?? null : null;

  const promptPickupIfNeeded = () => {
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
        hours_reading: delivery.hours_reading ?? null,
      },
      bookingEndDate: linkedBooking.end_date,
      forkliftName: forklift.name,
    });
  };

  const markComplete = (signature?: string) => {
    if (!delivery) return;
    try {
      const payload = buildCompletionPayload(
        delivery.id, nowMty().toISOString(), signature, hoursReading, minHours,
      );
      updateDelivery.mutate(payload, {
        onSuccess: () => {
          notifySuccess("Marcado como completado");
          setSignatureOpen(false);
          promptPickupIfNeeded();
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
