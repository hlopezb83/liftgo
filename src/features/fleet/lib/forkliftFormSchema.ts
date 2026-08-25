import { z } from "zod";

// R7 Bloque 10a: los inputs son strings pero validamos rangos numéricos.
// Regla: si el campo no está vacío, debe parsear a número finito dentro del rango.
const CURRENT_YEAR = new Date().getFullYear();


/** L-7: rango razonable 2000–2100 para la vigencia del seguro. */
function validateInsuranceExpiry(value: string | undefined, ctx: z.RefinementCtx) {
  if (!value) return;
  const expiryYear = new Date(value).getFullYear();
  if (!Number.isFinite(expiryYear) || expiryYear < 2000 || expiryYear > 2100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["insurance_expiry"],
      message: "Vigencia del seguro debe estar entre los años 2000 y 2100",
    });
  }
}

export const forkliftFormSchema = z
  .object({
    name: z.string().min(1, "Nombre es requerido").max(120, "Nombre demasiado largo"),
    model: z.string().min(1, "Modelo es requerido").max(120),
    manufacturer: z.string().default(""),
    year: z.string().default(""),
    capacity_kg: z.string().default(""),
    mast_height_m: z.string().default(""),
    fuel_type: z.string().min(1, "Tipo de combustible es requerido").default("Diesel"),
    serial_number: z.string().default(""),
    status: z.string().default("available"),
    daily_rate: z.string().default(""),
    weekly_rate: z.string().default(""),
    monthly_rate: z.string().default(""),
    acquisition_cost: z.string().default(""),
    notes: z.string().default(""),
    insurance_provider: z.string().default(""),
    insurance_policy_number: z.string().default(""),
    insurance_expiry: z.string().default(""),
    insurance_cost: z.string().default(""),
  })
  .superRefine((data, ctx) => {
    if (data.year) {
      const y = Number(data.year);
      if (!Number.isInteger(y) || y < 1980 || y > CURRENT_YEAR + 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["year"], message: `Año debe estar entre 1980 y ${CURRENT_YEAR + 1}` });
      }
    }
    validateInsuranceExpiry(data.insurance_expiry, ctx);
    if (data.capacity_kg) {
      const n = Number(data.capacity_kg);
      if (!Number.isFinite(n) || n <= 0 || n > 100_000) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["capacity_kg"], message: "Capacidad debe ser mayor a 0 y ≤ 100,000 kg" });
      }
    }
    if (data.mast_height_m) {
      const n = Number(data.mast_height_m);
      if (!Number.isFinite(n) || n <= 0 || n > 20) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["mast_height_m"], message: "Altura debe ser mayor a 0 y ≤ 20 m" });
      }
    }
    (
      [
        ["daily_rate", 999_999],
        ["weekly_rate", 9_999_999],
        ["monthly_rate", 9_999_999],
        ["acquisition_cost", 99_999_999],
        ["insurance_cost", 9_999_999],
      ] as const
    ).forEach(([field, max]) => {
      const val = data[field];
      if (!val) return;
      const n = Number(val);
      if (!Number.isFinite(n)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${field}: número inválido` });
        return;
      }
      if (n < 0) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: "No puede ser negativo" });
      if (n > max) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: "Excede el máximo permitido" });
    });
  });

export type ForkliftFormData = z.infer<typeof forkliftFormSchema>;
