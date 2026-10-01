import { z } from "zod";
import { nowMty } from "@/lib/utils";

export const workOrderCloseSchema = z.object({
  closed_at: z.date({ error: "Selecciona una fecha de cierre válida" })
    .refine((date) => date <= nowMty(), "La fecha de cierre no puede ser futura"),
  closing_notes: z.string().default(""),
});
