import { z } from "zod";

export const bookingFormSchema = z
  .object({
    forklift_id: z.string().min(1, "Montacargas es requerido"),
    date_range: z.object({
      from: z.date().optional(),
      to: z.date().optional(),
    }).refine((r) => !!r.from, { message: "Fecha de inicio es requerida" })
      .refine((r) => !!r.to, { message: "Fecha de fin es requerida" }),
    customer_id: z.string().default(""),
    customer_name: z.string().default(""),
    customer_contact: z.string().default(""),
    recurring_billing: z.boolean().default(false),
  })
  .refine((d) => {
    if (!d.date_range.from || !d.date_range.to) return true;
    return d.date_range.to >= d.date_range.from;
  }, {
    message: "La fecha de fin debe ser posterior a la de inicio",
    path: ["date_range"],
  })
  .refine((d) => {
    // Renta mínima de 1 día calendario: fin no puede ser anterior al inicio
    // (comparación por día, no por timestamp, para aceptar rentas del mismo día).
    if (!d.date_range.from || !d.date_range.to) return true;
    const from = new Date(d.date_range.from); from.setHours(0, 0, 0, 0);
    const to = new Date(d.date_range.to); to.setHours(0, 0, 0, 0);
    return to.getTime() >= from.getTime();
  }, {
    message: "La renta mínima es de 1 día",
    path: ["date_range"],
  });

export type BookingFormData = z.infer<typeof bookingFormSchema>;
