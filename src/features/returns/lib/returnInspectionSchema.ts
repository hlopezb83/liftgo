import { z } from "zod";

export const returnInspectionSchema = z.object({
  bookingId: z.string().min(1, "Selecciona una reserva para devolver"),
  inspectedAt: z.date(),
  condition: z.string().min(1),
  damageNotes: z.string(),
  damageCost: z.string(),
  hoursUsed: z.string(),
  fuelLevel: z.string(),
  inspectedBy: z.string(),
});

export type ReturnInspectionFormValues = z.infer<typeof returnInspectionSchema>;

export const initialReturnInspectionForm: ReturnInspectionFormValues = {
  bookingId: "",
  inspectedAt: new Date(),
  condition: "good",
  damageNotes: "",
  damageCost: "",
  hoursUsed: "",
  fuelLevel: "",
  inspectedBy: "",
};
