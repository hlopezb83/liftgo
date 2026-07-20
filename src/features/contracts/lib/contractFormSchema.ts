import { z } from "zod";

/**
 * UX-M1 · Schema Zod para ContractForm.
 *
 * Reemplaza al `useState`+toasts anterior por validación inline con `<FormMessage>`.
 * - Cliente y equipo son requeridos.
 * - Tarifas y montos ≥ 0.
 * - `end_date >= start_date` cuando ambas están presentes.
 *
 * Todos los campos numéricos se persisten como string en el form (compatibilidad
 * con `<Input type="number">`) y `buildContractPayload` los convierte a número.
 */
const nonNegativeNumeric = z
  .string()
  .refine((v) => v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0), {
    message: "Debe ser ≥ 0",
  });

export const contractFormSchema = z
  .object({
    customer_id: z.string().min(1, "Cliente requerido"),
    forklift_id: z.string().min(1, "Equipo requerido"),
    start_date: z.string(),
    end_date: z.string(),
    daily_rate: nonNegativeNumeric,
    weekly_rate: nonNegativeNumeric,
    monthly_rate: nonNegativeNumeric,
    deposit_amount: nonNegativeNumeric,
    terms_text: z.string(),
    signed_by: z.string(),
    notes: z.string(),
    usage_location: z.string(),
    max_hours_per_month: nonNegativeNumeric,
    extra_hour_rate: nonNegativeNumeric,
    payment_frequency: z.string().min(1),
    late_interest_rate: nonNegativeNumeric,
    contract_city: z.string(),
    witness_1: z.string(),
    witness_2: z.string(),
  })
  .refine(
    (v) => !v.start_date || !v.end_date || v.end_date >= v.start_date,
    { message: "La fecha de fin debe ser posterior o igual a la de inicio", path: ["end_date"] },
  );

export type ContractFormValues = z.infer<typeof contractFormSchema>;
