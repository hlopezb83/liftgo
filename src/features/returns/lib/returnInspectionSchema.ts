import { z } from "zod";

// R17-F: rechazar costos negativos y horas negativas desde el form (además del
// guard SQL en `complete_return_inspection`).
const nonNegativeNumericString = (label: string) =>
  z.string().refine((v) => {
    if (v === "" || v == null) return true;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0;
  }, `${label} no puede ser negativo`);

export const returnInspectionSchema = z.object({
  bookingId: z.string().min(1, "Selecciona una reserva para devolver"),
  inspectedAt: z.date(),
  condition: z.string().min(1),
  damageNotes: z.string(),
  damageCost: nonNegativeNumericString("El costo de daño"),
  hoursUsed: nonNegativeNumericString("Las horas usadas"),
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
