import { z } from "zod";
import { optionalEmail, regimenFiscalMatchesRfc, regimenFiscalOptional, rfcOptional } from "@/lib/schemas";

// R7 Bloque 21.4: trim en name, límites de longitud sensatos, y regex CP (5 dígitos)
// para prevenir capturas basura que rompen la generación CFDI.
const cpOptional = z
  .string()
  .default("")
  .refine((v) => v === "" || /^\d{5}$/.test(v), { message: "CP debe ser 5 dígitos" });

const customerFormBaseSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido").max(200, "Máximo 200 caracteres"),
  email: optionalEmail(),
  phone: z.string().trim().max(40, "Máximo 40 caracteres").default(""),
  address: z.string().max(500, "Máximo 500 caracteres").default(""),
  notes: z.string().max(2000, "Máximo 2000 caracteres").default(""),
  website: z.string().trim().max(200, "Máximo 200 caracteres").default(""),
  contact_person: z.string().trim().max(200, "Máximo 200 caracteres").default(""),

  rfc: rfcOptional(),
  regimen_fiscal: regimenFiscalOptional(),
  uso_cfdi: z.string().default(""),
  domicilio_fiscal_cp: cpOptional,
  representante_legal: z.string().trim().max(200, "Máximo 200 caracteres").default(""),
});

export const customerFormSchema = customerFormBaseSchema.refine(
  (data) => regimenFiscalMatchesRfc(data.rfc, data.regimen_fiscal),
  {
    message: "El régimen fiscal no aplica para el tipo de persona del RFC capturado",
    path: ["regimen_fiscal"],
  },
);

export type CustomerFormData = z.infer<typeof customerFormSchema>;
