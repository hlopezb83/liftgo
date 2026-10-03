import type { TaxIdValidationError } from "../_shared/facturapi/validateTaxId.ts";

export interface CustomerRow {
  id: string;
  name: string;
  relation_updated_at: string;
  rfc: string | null;
  razon_social: string | null;
  regimen_fiscal: string | null;
  domicilio_fiscal_cp: string | null;
}

/** Validación local antes de consultar al PAC; no necesita BD ni diagnóstico. */
export function missingFieldErrors(c: CustomerRow): TaxIdValidationError[] {
  const out: TaxIdValidationError[] = [];
  if (!c.rfc?.trim()) out.push({ path: "rfc", message: "Falta el RFC" });
  if (!(c.razon_social?.trim() || c.name?.trim())) {
    out.push({ path: "razon_social", message: "Falta la razón social" });
  }
  if (!c.regimen_fiscal?.trim()) {
    out.push({ path: "regimen_fiscal", message: "Falta el régimen fiscal" });
  }
  if (!c.domicilio_fiscal_cp?.trim()) {
    out.push({ path: "domicilio_fiscal_cp", message: "Falta el C.P. fiscal" });
  }
  return out;
}
