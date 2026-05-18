import type { Tables } from "@/integrations/supabase/types";

type Delivery = Tables<"deliveries">;

export const computeHoursUsed = (
  bookingId: string | null,
  siblings: Delivery[] | undefined,
): number | null => {
  if (!bookingId || !siblings) return null;
  const deliveryRecord = siblings.find((d) => d.type === "delivery" && d.hours_reading != null);
  const pickupRecord = siblings.find((d) => d.type === "pickup" && d.hours_reading != null);
  if (deliveryRecord?.hours_reading == null || pickupRecord?.hours_reading == null) return null;
  return Math.round((pickupRecord.hours_reading - deliveryRecord.hours_reading) * 10) / 10;
};

export const buildCompletionPayload = (
  id: string,
  completedAtIso: string,
  signature?: string,
  hoursReading?: string,
) => {
  const hrs = hoursReading ? parseFloat(hoursReading) : undefined;
  return {
    id,
    status: "completed" as const,
    completed_at: completedAtIso,
    ...(signature ? { signature_base64: signature } : {}),
    ...(hrs !== undefined ? { hours_reading: hrs } : {}),
  };
};
