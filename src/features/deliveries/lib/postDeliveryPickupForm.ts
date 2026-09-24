import { parseISO } from "date-fns";
import { z } from "zod";
import { toYMD } from "@/lib/date/toYMD";
import { nowMty } from "@/lib/utils";

/** La programación usa días calendario de Monterrey y se valida al enviar. */
export const isPastPickupDate = (date: Date) => toYMD(date) < toYMD(nowMty());

export const createPickupSchema = (minHours: number | null) => z.object({
  scheduledDate: z.date({ error: "Fecha requerida" }).refine(
    (date) => !isPastPickupDate(date),
    "La recolección debe programarse para hoy o una fecha futura",
  ),
  address: z.string().default(""),
  driverName: z.string().default(""),
  driverPhone: z.string().default(""),
  scheduledTime: z.string().default(""),
  hoursReading: z.number().min(0).nullable().default(null).refine(
    (value) => value === null || minHours === null || value >= minHours,
    {
      message: minHours !== null
        ? `El horómetro no puede ser menor a ${minHours} hrs (registradas en la entrega).`
        : "Horómetro inválido",
    },
  ),
  notes: z.string().default(""),
});

export type PickupFormValues = z.infer<ReturnType<typeof createPickupSchema>>;

export function defaultPickupDate(bookingEndDate: string): Date {
  const today = nowMty();
  return bookingEndDate >= toYMD(today) ? parseISO(bookingEndDate) : today;
}
