import type { Delivery } from "@/hooks/useDeliveries";

export interface HourometerData {
  deliveryHours: number | null;
  pickupHours: number | null;
  hoursUsed: number | null;
}

export function useBookingHourometer(deliveries: Delivery[] | undefined): HourometerData {
  const delivery = deliveries?.find((d) => d.type === "delivery" && d.hours_reading != null);
  const pickup = deliveries?.find((d) => d.type === "pickup" && d.hours_reading != null);
  const deliveryHours = delivery?.hours_reading ?? null;
  const pickupHours = pickup?.hours_reading ?? null;
  const hoursUsed =
    deliveryHours != null && pickupHours != null
      ? Math.round((pickupHours - deliveryHours) * 10) / 10
      : null;
  return { deliveryHours, pickupHours, hoursUsed };
}
