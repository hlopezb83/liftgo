/**
 * Traducción de mensajes de error comunes de Facturapi/SAT a español-MX.
 * Si no encuentra coincidencia devuelve el mensaje original.
 */
const PATTERNS: Array<{ test: RegExp; message: string }> = [
  {
    test: /CFDI40148|CFDI40149|DomicilioFiscalReceptor|debe pertenecer al nombre asociado al RFC/i,
    message:
      "El código postal fiscal del cliente no coincide con el RFC registrado en el SAT. Verifica la Constancia de Situación Fiscal (CSF) del cliente y corrige el CP fiscal, RFC o razón social.",
  },
  { test: /CFDI40101|tax_id.*required|RFC.*required/i,
    message: "El RFC del receptor es obligatorio y debe ser válido." },
  { test: /CFDI40102|tax_system|regimen.*fiscal/i,
    message: "El régimen fiscal del receptor no es válido o está ausente." },
  { test: /CFDI40103|address\.zip|c[oó]digo.*postal/i,
    message: "El código postal del receptor es obligatorio." },
  { test: /CFDI40104|legal_name|raz[oó]n.*social/i,
    message: "La razón social del receptor no coincide con el SAT." },
  { test: /CFDI40147|use.*cfdi|uso.*cfdi/i,
    message: "El Uso CFDI no es compatible con el régimen fiscal del receptor." },
  { test: /CFDI33102|payment_form|forma.*pago/i,
    message: "La forma de pago no es válida según el catálogo SAT." },
  { test: /CFDI33103|payment_method|m[eé]todo.*pago/i,
    message: "El método de pago no es válido (usa PUE o PPD)." },
  { test: /folio.*duplicate|folio.*already/i,
    message: "El folio ya fue usado. Genera un nuevo número de factura." },
  { test: /certificate.*expired|csd.*expired/i,
    message: "El certificado de sello digital (CSD) está vencido. Renuévalo ante el SAT." },
  { test: /insufficient.*credits|sin.*timbres/i,
    message: "Sin folios disponibles en Facturapi. Recarga tu plan de timbres." },
  { test: /unauthorized|invalid.*api.*key/i,
    message: "API key de Facturapi inválida. Revisa Datos Fiscales → PAC." },
];

export function translateFacturapiError(raw: string | null | undefined): string {
  if (!raw) return "Error desconocido al timbrar.";
  for (const p of PATTERNS) {
    if (p.test.test(raw)) return p.message;
  }
  // Si no hubo match, devuelve un fragmento legible
  return raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
}
