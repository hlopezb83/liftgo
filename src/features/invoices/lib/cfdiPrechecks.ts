import type { Tables } from "@/integrations/supabase/types";

/**
 * Reglas mínimas que Facturapi exige para timbrar un CFDI 4.0.
 * Si falta cualquiera de estos campos, la petición se rechaza con error CFDI40xxx
 * y consume un intento sin generar el comprobante.
 */
const RECEPTOR_FIELDS: Array<{ key: keyof Tables<"invoices">; label: string }> = [
  { key: "receptor_rfc", label: "RFC del receptor" },
  { key: "receptor_razon_social", label: "Razón social del receptor" },
  { key: "receptor_regimen_fiscal", label: "Régimen fiscal del receptor" },
  { key: "receptor_domicilio_fiscal_cp", label: "Código postal del receptor" },
];

const CFDI_FIELDS: Array<{ key: keyof Tables<"invoices">; label: string }> = [
  { key: "uso_cfdi", label: "Uso CFDI" },
  { key: "forma_pago", label: "Forma de pago" },
  { key: "metodo_pago", label: "Método de pago" },
];

export function getMissingStampFields(invoice: Tables<"invoices">): string[] {
  const missing: string[] = [];
  for (const f of [...RECEPTOR_FIELDS, ...CFDI_FIELDS]) {
    const value = invoice[f.key];
    if (value === null || value === undefined || String(value).trim() === "") {
      missing.push(f.label);
    }
  }
  return missing;
}
