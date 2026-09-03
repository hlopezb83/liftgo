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
  signature?: string,
  hoursReading?: string,
  /** R10 Bloque 4 / FIX-R2-06 (03-FIX-07): piso del horómetro = máximo entre
   *  la entrega hermana y la última lectura global de la unidad (monótono). */
  minHours?: number | null,
  /** Bug 3: justificación breve cuando se completa sin operador ni firma. */
  noEvidenceReason?: string | null,
) => {
  const hrs = hoursReading ? parseFloat(hoursReading) : undefined;
  if (hrs !== undefined) {
    if (!Number.isFinite(hrs) || hrs < 0) {
      throw new Error("El horómetro debe ser un número mayor o igual a 0.");
    }
    if (minHours != null && hrs < minHours) {
      throw new Error(
        `El horómetro no puede ser menor a ${minHours} hrs (última lectura registrada de la unidad).`,
      );
    }
  }
  const reason = noEvidenceReason?.trim();
  return {
    id,
    status: "completed" as const,
    // Bugs 1-2: completed_at YA NO se envía desde el cliente. El trigger
    // `trg_set_delivery_completed_at` lo sella con el reloj del servidor
    // (nunca NULL, nunca anterior a created_at por reloj del navegador).
    ...(signature ? { signature_base64: signature } : {}),
    ...(hrs !== undefined ? { hours_reading: hrs } : {}),
    ...(reason ? { completed_no_evidence_reason: reason } : {}),
  };
};

/**
 * Bug 3: una entrega completada sin firma NI operador asignado carece de
 * evidencia operativa; en ese caso se exige una justificación breve.
 */
export const isMissingOperationalEvidence = (
  driverName: string | null | undefined,
  signature?: string | null,
): boolean => !signature && !driverName?.trim();


export const buildDeliverySubtitle = (
  forkliftName: string | null | undefined,
  type: string,
): string => {
  const name = forkliftName ?? "Equipo";
  const label = type === "delivery" ? "Entrega" : "Recolección";
  return `${name} · ${label}`;
};

/**
 * Espejo de DB3-15: completed → nadie; scheduled → solo admin; cancelled → ok.
 */
export const canDeleteDeliveryFor = (
  status: string,
  role: string | null | undefined,
): boolean => {
  if (status === "completed") return false;
  if (status === "scheduled") return role === "admin";
  return true;
};
