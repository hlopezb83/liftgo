import { z } from "zod";

// R17-F: rechazar costos negativos y horas negativas desde el form (además del
// guard SQL en `complete_return_inspection`).
const nonNegativeNumericString = (label: string) =>
  z.string().refine((v) => {
    if (v === "" || v == null) return true;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0;
  }, `${label} no puede ser negativo`);

// A-05: condiciones que implican daño — exigen evidencia inline (notas + costo).
const DAMAGE_CONDITIONS = ["minor_damage", "major_damage", "needs_repair"];

export const returnInspectionSchema = z
  .object({
    bookingId: z.string().min(1, "Selecciona una reserva para devolver"),
    inspectedAt: z.date(),
    condition: z.string().min(1),
    damageNotes: z.string(),
    damageCost: nonNegativeNumericString("El costo de daño"),
    hoursUsed: nonNegativeNumericString("Las horas usadas"),
    fuelLevel: z.string(),
    inspectedBy: z.string(),
  })
  .superRefine((values, ctx) => {
    const hasDamageNotes = values.damageNotes.trim().length > 0;
    const hasDamageCost = values.damageCost.trim().length > 0;

    if (DAMAGE_CONDITIONS.includes(values.condition)) {
      if (!hasDamageNotes) {
        ctx.addIssue({
          code: "custom",
          path: ["damageNotes"],
          message: "Describe el daño encontrado (obligatorio cuando hay daño)",
        });
      }
      const cost = values.damageCost.trim();
      if (cost === "" || !Number.isFinite(Number(cost))) {
        ctx.addIssue({
          code: "custom",
          path: ["damageCost"],
          message: "Captura el costo del daño (usa 0 si no aplica cargo)",
        });
      }
      return;
    }

    // FE2-12: una condición sin daño no debe llevar notas ni costo de daño.
    // Si hay daño documentado, el usuario debe elegir una condición dañada.
    if (hasDamageNotes) {
      ctx.addIssue({
        code: "custom",
        path: ["damageNotes"],
        message: "Solo puedes capturar notas de daño cuando la condición indica daño",
      });
    }
    if (hasDamageCost) {
      ctx.addIssue({
        code: "custom",
        path: ["damageCost"],
        message: "Solo puedes capturar costo de daño cuando la condición indica daño",
      });
    }
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
