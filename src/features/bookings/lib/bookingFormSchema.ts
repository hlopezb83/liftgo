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
  });

export type BookingFormData = z.infer<typeof bookingFormSchema>;
