import { z } from "zod";
import { optionalEmail, rfcOptional } from "@/lib/schemas";

/**
 * Schema validacional del formulario de Proveedor.
 * Alineado con el patrón usado en CustomerFormSchema (RHF + Zod).
 */
export const supplierFormSchema = z.object({
  name: z.string().trim().min(1, "El nombre es requerido"),
  contact_person: z.string().default(""),
  email: optionalEmail(),
  phone: z.string().default(""),
  website: z.string().default(""),
  address: z.string().default(""),
  rfc: rfcOptional(),
  regimen_fiscal: z.string().default(""),
  category: z.string().default(""),
  notes: z.string().default(""),
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
