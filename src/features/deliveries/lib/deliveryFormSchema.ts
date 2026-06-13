import { z } from "zod";

export const deliverySchema = z.object({
  forkliftId: z.string().min(1, "Selecciona un montacargas"),
  bookingId: z.string(),
  type: z.string().min(1),
  scheduledDate: z.date({ required_error: "Fecha requerida" }),
  scheduledTime: z.string(),
  address: z.string(),
  driverName: z.string(),
  driverPhone: z.string(),
  notes: z.string(),
});
