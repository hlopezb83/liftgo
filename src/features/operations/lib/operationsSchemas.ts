import { z } from "zod";
import { rfcRequired } from "@/lib/schemas/common";

export const fiscalSchema = z.object({
  rfc: rfcRequired(),
  razon_social: z.string().min(1, "Razón social requerida"),
  regimen_fiscal: z.string().min(1, "Régimen fiscal requerido"),
  lugar_expedicion: z.string().min(1, "Lugar de expedición requerido"),
  logo_url: z.string(),
  facturapi_mode: z.string(),
  facturapi_test_key: z.string(),
  facturapi_live_key: z.string(),
});

export type FiscalDataValues = z.infer<typeof fiscalSchema>;

export const logoSchema = z.object({ logo_url: z.string() });
export type LogoFormValues = z.infer<typeof logoSchema>;
