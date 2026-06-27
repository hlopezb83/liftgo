/**
 * Traducción de mensajes de error comunes de Facturapi/SAT a español-MX.
 * Si no encuentra coincidencia devuelve el mensaje original.
 */
export type FacturapiErrorKind =
  | "receptor_data"
  | "csd"
  | "credits"
  | "auth"
  | "folio"
  | "unknown";

interface Pattern {
  test: RegExp;
  message: string;
  kind: FacturapiErrorKind;
}

const PATTERNS: Pattern[] = [
  {
    test: /CFDI40148|CFDI40149|DomicilioFiscalReceptor|debe pertenecer al nombre asociado al RFC/i,
    message:
      "Los datos fiscales del cliente no coinciden con los que tiene registrados el SAT. Revisa que el RFC, la razón social y el código postal del domicilio fiscal coincidan exactamente con la Constancia de Situación Fiscal (CSF) más reciente del cliente.",
    kind: "receptor_data",
  },
  {
    test: /CFDI40101|tax_id.*required|RFC.*required/i,
    message: "El RFC del receptor es obligatorio y debe ser válido.",
    kind: "receptor_data",
  },
  {
    test: /CFDI40102|tax_system|regimen.*fiscal/i,
    message: "El régimen fiscal del receptor no es válido o está ausente.",
    kind: "receptor_data",
  },
  {
    test: /CFDI40103|address\.zip|c[oó]digo.*postal/i,
    message: "El código postal del receptor es obligatorio.",
    kind: "receptor_data",
  },
  {
    test: /CFDI40104|legal_name|raz[oó]n.*social/i,
    message: "La razón social del receptor no coincide con el SAT.",
    kind: "receptor_data",
  },
  {
    test: /CFDI40147|use.*cfdi|uso.*cfdi/i,
    message: "El Uso CFDI no es compatible con el régimen fiscal del receptor.",
    kind: "receptor_data",
  },
  {
    test: /CFDI33102|payment_form|forma.*pago/i,
    message: "La forma de pago no es válida según el catálogo SAT.",
    kind: "receptor_data",
  },
  {
    test: /CFDI33103|payment_method|m[eé]todo.*pago/i,
    message: "El método de pago no es válido (usa PUE o PPD).",
    kind: "receptor_data",
  },
  {
    test: /folio.*duplicate|folio.*already/i,
    message: "El folio ya fue usado. Genera un nuevo número de factura.",
    kind: "folio",
  },
  {
    test: /certificate.*expired|csd.*expired/i,
    message: "El certificado de sello digital (CSD) está vencido. Renuévalo ante el SAT.",
    kind: "csd",
  },
  {
    test: /insufficient.*credits|sin.*timbres/i,
    message: "Sin folios disponibles en Facturapi. Recarga tu plan de timbres.",
    kind: "credits",
  },
  {
    test: /unauthorized|invalid.*api.*key/i,
    message: "API key de Facturapi inválida. Revisa Datos Fiscales → PAC.",
    kind: "auth",
  },
];

export interface ClassifiedFacturapiError {
  message: string;
  kind: FacturapiErrorKind;
}

export function classifyFacturapiError(
  raw: string | null | undefined,
): ClassifiedFacturapiError {
  if (!raw) return { message: "Error desconocido al timbrar.", kind: "unknown" };
  for (const p of PATTERNS) {
    if (p.test.test(raw)) return { message: p.message, kind: p.kind };
  }
  const message = raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
  return { message, kind: "unknown" };
}

export function translateFacturapiError(raw: string | null | undefined): string {
  return classifyFacturapiError(raw).message;
}
