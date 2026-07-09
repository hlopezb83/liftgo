import { z } from "zod";
import { optionalEmail, rfcOptional } from "@/lib/schemas/common";

export const customerFormSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  email: optionalEmail(),
  phone: z.string().default(""),
  address: z.string().default(""),
  notes: z.string().default(""),
  website: z.string().default(""),
  contact_person: z.string().default(""),

  rfc: rfcOptional(),
  regimen_fiscal: z.string().default(""),
  uso_cfdi: z.string().default(""),
  domicilio_fiscal_cp: z.string().default(""),
  representante_legal: z.string().default(""),
});

export type CustomerFormData = z.infer<typeof customerFormSchema>;
