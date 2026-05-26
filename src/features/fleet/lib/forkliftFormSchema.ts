import { z } from "zod";

export const forkliftFormSchema = z.object({
  name: z.string().min(1, "Nombre es requerido"),
  model: z.string().min(1, "Modelo es requerido"),
  manufacturer: z.string().default(""),
  year: z.string().default(""),
  capacity_kg: z.string().default(""),
  mast_height_m: z.string().default(""),
  fuel_type: z.string().default("Diesel"),
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
});

export type ForkliftFormData = z.infer<typeof forkliftFormSchema>;
