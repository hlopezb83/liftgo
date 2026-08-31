import { z } from "zod";
import { optionalEmail, regimenFiscalMatchesRfc, regimenFiscalOptional, rfcOptional } from "@/lib/schemas";

/**
 * Schema validacional del formulario de Proveedor.
 * Alineado con el patrón usado en CustomerFormSchema (RHF + Zod).
 */
const supplierFormBaseSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido").max(200, "Máximo 200 caracteres"),
  contact_person: z.string().trim().max(200, "Máximo 200 caracteres").default(""),
  email: optionalEmail(),
  phone: z.string().trim().max(40, "Máximo 40 caracteres").default(""),
  website: z.string().trim().max(200, "Máximo 200 caracteres").default(""),
  address: z.string().max(500, "Máximo 500 caracteres").default(""),
  rfc: rfcOptional(),
  regimen_fiscal: regimenFiscalOptional(),
  category: z.string().default(""),
  notes: z.string().max(2000, "Máximo 2000 caracteres").default(""),
  default_payment_terms_days: z
    .string()
    .default("")
    .refine((v) => {
      const t = v.trim();
      if (t === "") return true;
      const n = Number(t);
      return Number.isFinite(n) && n >= 0 && n <= 365;
    }, { message: "Debe ser un número entre 0 y 365" }),
});

export const supplierFormSchema = supplierFormBaseSchema.refine(
  (data) => regimenFiscalMatchesRfc(data.rfc, data.regimen_fiscal),
  {
    message: "El régimen fiscal no aplica para el tipo de persona del RFC capturado",
    path: ["regimen_fiscal"],
  },
);

export type SupplierFormData = z.infer<typeof supplierFormSchema>;

export const emptySupplierFormData: SupplierFormData = {
  name: "",
  contact_person: "",
  email: "",
  phone: "",
  website: "",
  address: "",
  rfc: "",
  regimen_fiscal: "",
  category: "",
  notes: "",
  default_payment_terms_days: "",
};
