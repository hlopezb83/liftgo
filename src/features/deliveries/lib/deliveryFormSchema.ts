import { z } from "zod";

export const deliverySchema = z.object({
  forkliftId: z.string().min(1, "Selecciona un montacargas"),
  bookingId: z.string().min(1, "La entrega debe estar ligada a una reserva"),
  type: z.string().min(1),
  // N-9: registrar una entrega/recolección YA REALIZADA (histórico) permite
  // fecha pasada; la guarda "no pasado" sólo aplica a programación futura.
  alreadyCompleted: z.boolean().default(false),
  scheduledDate: z.date({ error: "Fecha requerida" }),
  scheduledTime: z.string(),
  address: z.string(),
  driverName: z.string(),
  driverPhone: z.string(),
  notes: z.string(),
}).superRefine((values, ctx) => {
  // La fecha pasada sólo es válida si se registra como completada.
  if (values.alreadyCompleted) return;
  const day = new Date(values.scheduledDate); day.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (day.getTime() < today.getTime()) {
    ctx.addIssue({
      code: "custom",
      path: ["scheduledDate"],
      message: "La fecha es pasada: marca “Ya se realizó” para registrar una entrega histórica",
    });
  }
});
