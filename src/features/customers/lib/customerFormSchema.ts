import { z } from "zod";

export const customerFormSchema = z.object({
  name: z.string().min(1, "El nombre es requerido"),
  email: z
    .string()
    .default("")
    .refine((v) => !v || z.string().email().safeParse(v).success, {
      message: "Correo electrónico inválido",
    }),
  phone: z.string().default(""),
  address: z.string().default(""),
  notes: z.string().default(""),
  website: z.string().default(""),
  contact_person: z.string().default(""),

  rfc: z.string().default(""),
  regimen_fiscal: z.string().default(""),
  uso_cfdi: z.string().default(""),
  domicilio_fiscal_cp: z.string().default(""),
  representante_legal: z.string().default(""),
});

export type CustomerFormData = z.infer<typeof customerFormSchema>;
