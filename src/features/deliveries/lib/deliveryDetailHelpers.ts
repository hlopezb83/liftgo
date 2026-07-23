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
  /** R10 Bloque 4: horómetro de la entrega para validar que la recolección no
   *  sea menor (produciría "Horas Usadas" negativo). */
  minHours?: number | null,
) => {
  const hrs = hoursReading ? parseFloat(hoursReading) : undefined;
  if (hrs !== undefined && Number.isFinite(hrs) && minHours != null && hrs < minHours) {
    throw new Error(
      `El horómetro no puede ser menor a ${minHours} hrs (registradas en la entrega).`,
    );
  }
  return {
    id,
    status: "completed" as const,
    completed_at: completedAtIso,
    ...(signature ? { signature_base64: signature } : {}),
    ...(hrs !== undefined ? { hours_reading: hrs } : {}),
  };
};


export const buildDeliverySubtitle = (
  forkliftName: string | null | undefined,
  type: string,
): string => {
  const name = forkliftName ?? "Equipo";
  const label = type === "delivery" ? "Entrega" : "Recolección";
  return `${name} · ${label}`;
};
