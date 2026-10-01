import type { Tables } from "@/integrations/supabase/types";
import { describeBusinessBlock, type BusinessBlock } from "@/lib/rules/businessBlocks";
import { formatMtyDate } from "@/lib/utils";

type BookingDates = Pick<Tables<"bookings">, "start_date" | "end_date" | "return_status">;
export type DeliveryState = Pick<Tables<"deliveries">, "type" | "status"> &
  Partial<Pick<Tables<"deliveries">, "completed_at">>;

interface TransportState {
  deliveries: DeliveryState[] | undefined;
  isLoading: boolean;
  isError: boolean;
}

interface ReturnActionAvailability {
  block: BusinessBlock | null;
  isEarly: boolean;
}

/** Mirror the visible prerequisites of useReturnableBookings; the query still validates on open. */
export function returnActionAvailability(
  booking: BookingDates,
  transports: TransportState,
  today: string,
): ReturnActionAvailability {
  const isEarly = booking.end_date > today;

  if (booking.return_status !== null) {
    return { block: describeBusinessBlock("booking_return_already_recorded"), isEarly };
  }
  if (transports.isLoading) {
    return {
      block: describeBusinessBlock("booking_return_delivery_unverified", {
        reason: "Todavía se están comprobando los transportes de esta reserva.",
        nextStep: "Espera a que termine la carga.",
      }),
      isEarly,
    };
  }
  if (transports.isError) {
    return {
      block: describeBusinessBlock("booking_return_delivery_unverified", {
        reason: "No se pudieron cargar los transportes de esta reserva.",
        nextStep: "Usa Reintentar en Transportes de la reserva.",
      }),
      isEarly,
    };
  }
  const hasCompletedDelivery = transports.deliveries?.some(
    (delivery) => delivery.type === "delivery" && delivery.status === "completed" &&
      (delivery.completed_at
        ? Number.isFinite(Date.parse(delivery.completed_at)) && formatMtyDate(delivery.completed_at, "yyyy-MM-dd") <= today
        : booking.start_date <= today),
  );
  if (booking.start_date > today && !hasCompletedDelivery) {
    return { block: describeBusinessBlock("booking_return_not_started"), isEarly };
  }
  return {
    block: hasCompletedDelivery ? null : describeBusinessBlock("booking_return_delivery_unverified"),
    isEarly,
  };
}
