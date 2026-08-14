/**
 * Traducción de errores de Facturapi / PAC / SAT a español-MX accionable.
 *
 * Cubre dos familias:
 *  - Códigos de validación del Anexo 20 (`CFDI40xxx`, `CFDI33xxx`).
 *  - Códigos numéricos del servicio de timbrado del SAT (301, 302, 402…).
 *
 * `classifyFacturapiError` devuelve el mensaje resumido para el toast y
 * conserva el texto completo en `raw` para que viaje al reporte copiable
 * de `ErrorDetailsDialog` (soporte administrativo lo necesita íntegro).
 */
export type FacturapiErrorKind =
  | "receptor_data"
  | "csd"
  | "credits"
  | "auth"
  | "folio"
  | "xml"
  | "padron"
  | "duplicate"
  | "date_range"
  | "unknown";

interface Pattern {
  test: RegExp;
  message: string;
  kind: FacturapiErrorKind;
  /** Código canónico reportado (CFDI40148, SAT-301, …). */
  code?: string;
  /** Encabezado corto para el toast/diálogo. */
  title?: string;
}

/**
 * Construye un patrón para un código numérico del SAT evitando falsos
 * positivos con montos o folios: el número debe venir precedido de un
 * indicador de código (`código`, `code`, `error`, `CFDI`) o iniciar el texto.
 */
function satCode(code: string): RegExp {
  return new RegExp(
    `(?:^|c[oó]digo\\s*(?:de\\s*error\\s*)?[:=\\-]?\\s*|code\\s*[:=\\-]?\\s*|error\\s*[:=\\-]?\\s*|\\bCFDI\\s*)${code}\\b`,
    "i",
  );
}

/** Códigos numéricos del servicio de timbrado del SAT/PAC. */
const SAT_CODES: Pattern[] = [
  {
    test: satCode("301"),
    code: "SAT-301",
    title: "XML mal formado",
    message:
      "El SAT rechazó el comprobante porque el XML está mal formado. Suele deberse a caracteres inválidos en algún campo de texto (razón social, concepto, notas). Revisa los conceptos y vuelve a timbrar; si persiste, comparte el reporte con soporte.",
    kind: "xml",
  },
  {
    test: satCode("302"),
    code: "SAT-302",
    title: "Sello inválido",
    message:
      "El sello digital del comprobante es inválido. Verifica que el CSD cargado en Datos Fiscales corresponda al RFC emisor y que los archivos .cer y .key sean el par correcto.",
    kind: "csd",
  },
  {
    test: satCode("303"),
    code: "SAT-303",
    title: "Certificado no corresponde al emisor",
    message:
      "El certificado de sello digital no pertenece al RFC emisor configurado. Corrige el RFC de la empresa o carga el CSD correcto en Datos Fiscales.",
    kind: "csd",
  },
  {
    test: satCode("304"),
    code: "SAT-304",
    title: "Certificado revocado o caduco",
    message:
      "El certificado de sello digital está revocado o venció. Tramita un CSD nuevo ante el SAT y cárgalo en Datos Fiscales.",
    kind: "csd",
  },
  {
    test: satCode("305"),
    code: "SAT-305",
    title: "Fecha fuera de rango",
    message:
      "La fecha del comprobante está fuera del rango permitido (máximo 72 horas de antigüedad). Ajusta la fecha de la factura y vuelve a timbrar.",
    kind: "date_range",
  },
  {
    test: satCode("306"),
    code: "SAT-306",
    title: "Llave inválida",
    message:
      "La llave privada usada para sellar no es válida. Vuelve a cargar el par .cer/.key del CSD en Datos Fiscales.",
    kind: "csd",
  },
  {
    test: satCode("307"),
    code: "SAT-307",
    title: "CFDI duplicado",
    message:
      "El SAT detectó un comprobante duplicado (mismo emisor, receptor, monto y folio en menos de 72 horas). Revisa si la factura ya se timbró antes de reintentar.",
    kind: "duplicate",
  },
  {
    test: satCode("401"),
    code: "SAT-401",
    title: "RFC emisor no inscrito",
    message:
      "El RFC emisor no está inscrito en el padrón de contribuyentes con obligación de facturar. Verifica el RFC de la empresa en Datos Fiscales y su estatus ante el SAT.",
    kind: "padron",
  },
  {
    test: satCode("402"),
    code: "SAT-402",
    title: "RFC no inscrito en el padrón",
    message:
      "El RFC del receptor no está inscrito en el padrón del SAT o no está activo. Pide al cliente su Constancia de Situación Fiscal vigente y actualiza su RFC en la ficha del cliente.",
    kind: "padron",
  },
  {
    test: satCode("403"),
    code: "SAT-403",
    title: "Fecha anterior al certificado",
    message:
      "La fecha de emisión es anterior a la vigencia del certificado. Ajusta la fecha de la factura al periodo de vigencia del CSD.",
    kind: "date_range",
  },
  {
    test: satCode("404"),
    code: "SAT-404",
    title: "Sin folios disponibles",
    message:
      "No hay timbres disponibles con el PAC. Recarga tu paquete de timbres en Facturapi e intenta de nuevo.",
    kind: "credits",
  },
];

const PATTERNS: Pattern[] = [
  {
    test: /CFDI40148|DomicilioFiscalReceptor|domicilio.*fiscal.*receptor/i,
    code: "CFDI40148",
    title: "Código postal del receptor",
    message:
      "El código postal del domicilio fiscal del cliente no coincide con el que el SAT tiene registrado para su RFC. Descarga la Constancia de Situación Fiscal (CSF) vigente del cliente y corrige el CP en su ficha — debe ser exactamente el que aparece en la sección 'Datos de Ubicación'.",
    kind: "receptor_data",
  },
  {
    test: /CFDI40147|NombreRazonSocialReceptor|nombre.*no coincide.*RFC|no coincide con el nombre.*RFC/i,
    code: "CFDI40147",
    title: "Razón social del receptor",
    message:
      "La razón social enviada no coincide con la que el SAT tiene registrada para este RFC. Verifica en la CSF del cliente el nombre exacto (sin 'S.A. de C.V.' ni acentos) y actualízalo en su ficha.",
    kind: "receptor_data",
  },
  {
    test: /debe pertenecer al nombre asociado al RFC/i,
    title: "Datos fiscales del receptor",
    message:
      "Los datos fiscales del cliente no coinciden con los que tiene registrados el SAT. Revisa que el RFC, la razón social y el código postal coincidan exactamente con la CSF más reciente del cliente.",
    kind: "receptor_data",
  },

  {
    test: /CFDI40101|tax_id.*required|RFC.*required/i,
    code: "CFDI40101",
    message: "El RFC del receptor es obligatorio y debe ser válido.",
    kind: "receptor_data",
  },
  {
    test: /CFDI40102|tax_system|regimen.*fiscal/i,
    code: "CFDI40102",
    message: "El régimen fiscal del receptor no es válido o está ausente.",
    kind: "receptor_data",
  },
  {
    test: /CFDI40103|address\.zip|c[oó]digo.*postal/i,
    code: "CFDI40103",
    message: "El código postal del receptor es obligatorio.",
    kind: "receptor_data",
  },
  {
    test: /CFDI40104|legal_name|raz[oó]n.*social/i,
    code: "CFDI40104",
    message: "La razón social del receptor no coincide con el SAT.",
    kind: "receptor_data",
  },
  {
    test: /CFDI40147|use.*cfdi|uso.*cfdi/i,
    code: "CFDI40147",
    message: "El Uso CFDI no es compatible con el régimen fiscal del receptor.",
    kind: "receptor_data",
  },
  {
    test: /CFDI33102|payment_form|forma.*pago/i,
    code: "CFDI33102",
    message: "La forma de pago no es válida según el catálogo SAT.",
    kind: "receptor_data",
  },
  {
    test: /CFDI33103|payment_method|m[eé]todo.*pago/i,
    code: "CFDI33103",
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
  ...SAT_CODES,
];

export interface ClassifiedFacturapiError {
  /** Mensaje listo para mostrar al usuario. */
  message: string;
  kind: FacturapiErrorKind;
  /** Código canónico detectado, si lo hubo (CFDI40148, SAT-402…). */
  code?: string;
  /** Encabezado corto sugerido para el toast/diálogo. */
  title?: string;
  /** Texto original completo, sin recortar, para el reporte de soporte. */
  raw: string;
}

/** Corta el texto solo para el mensaje del toast; `raw` conserva todo. */
function summarize(raw: string): string {
  return raw.length > 200 ? `${raw.slice(0, 200)}…` : raw;
}

export function classifyFacturapiError(
  raw: string | null | undefined,
): ClassifiedFacturapiError {
  if (!raw) {
    return { message: "Error desconocido al timbrar.", kind: "unknown", raw: "" };
  }
  for (const p of PATTERNS) {
    if (p.test.test(raw)) {
      return { message: p.message, kind: p.kind, code: p.code, title: p.title, raw };
    }
  }
  return { message: summarize(raw), kind: "unknown", raw };
}

export function translateFacturapiError(raw: string | null | undefined): string {
  return classifyFacturapiError(raw).message;
}
