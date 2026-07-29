import { z } from "zod";

export const deliverySchema = z.object({
  forkliftId: z.string().min(1, "Selecciona un montacargas"),
  bookingId: z.string().min(1, "La entrega debe estar ligada a una reserva"),
  type: z.string().min(1),
  scheduledDate: z.date({ error: "Fecha requerida" }).refine((d) => {
    // Comparación por día calendario: se permite programar para hoy.
    const day = new Date(d); day.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return day.getTime() >= today.getTime();
  }, { message: "La entrega no puede programarse en el pasado" }),
  scheduledTime: z.string(),
  address: z.string(),
  driverName: z.string(),
  driverPhone: z.string(),
  notes: z.string(),
});
