import { z } from "zod";
import { isValidRegimenFiscalCode } from "@/lib/fiscal/regimenFiscal";
import { rfcRequired } from "@/lib/schemas";

export const fiscalSchema = z.object({
  rfc: rfcRequired(),
  razon_social: z.string().min(1, "Razón social requerida"),
  regimen_fiscal: z
    .string()
    .min(1, "Régimen fiscal requerido")
    .refine(isValidRegimenFiscalCode, { message: "Régimen fiscal inválido: no pertenece al catálogo del SAT" }),
  lugar_expedicion: z
    .string()
    .min(1, "Lugar de expedición requerido")
    .refine((v) => /^\d{5}$/.test(v), { message: "Lugar de expedición debe ser un código postal de 5 dígitos" }),
  logo_url: z.string(),
  facturapi_mode: z.string(),
  facturapi_test_key: z.string(),
  facturapi_live_key: z.string(),
});

export type FiscalDataValues = z.infer<typeof fiscalSchema>;

export const logoSchema = z.object({ logo_url: z.string() });
export type LogoFormValues = z.infer<typeof logoSchema>;
