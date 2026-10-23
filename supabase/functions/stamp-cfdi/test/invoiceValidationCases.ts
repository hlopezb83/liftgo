// Baseline messages and their precedence, captured before the extraction.
const fiscal = {
  receptor_rfc: "AAA010101AA1",
  receptor_regimen_fiscal: "601",
  receptor_domicilio_fiscal_cp: "64000",
};

const missingFiscal =
  "Faltan datos fiscales del receptor: régimen fiscal del receptor, código postal fiscal del receptor";
const missingGlobal =
  "Faltan datos de Información Global: periodicidad, meses, año";
const invalidFx =
  "La factura está en USD pero no tiene un tipo de cambio válido. Captura un tipo de cambio numérico mayor a 0 y distinto de 1 antes de timbrar.";
export const validationCases: Array<{
  name: string;
  invoice: Record<string, unknown>;
  status: 400 | 422;
  error: string;
  release?: string;
}> = [
  {
    name: "RFC precedes missing fiscal and FX",
    invoice: { receptor_rfc: "bad", moneda: "USD" },
    status: 400,
    error: 'El RFC "BAD" no tiene un formato válido del SAT.',
  },
  {
    name: "missing fiscal precedes FX",
    invoice: { receptor_rfc: fiscal.receptor_rfc, moneda: "USD" },
    status: 400,
    error:
      `${missingFiscal}. Captúralos en el cliente o en la factura antes de timbrar.`,
    release: missingFiscal,
  },
  {
    name: "invalid regimen precedes incompatible use",
    invoice: {
      ...fiscal,
      receptor_regimen_fiscal: "601 - General",
      uso_cfdi: "bad",
    },
    status: 422,
    error:
      'El régimen fiscal del receptor "601 - General" no es un código válido del catálogo del SAT (c_RegimenFiscal). Debe ser el código de 3 dígitos, p. ej. "601". Corrígelo en el cliente antes de timbrar.',
  },
  {
    name: "incompatible use precedes FX",
    invoice: {
      ...fiscal,
      receptor_regimen_fiscal: "616",
      uso_cfdi: "G03",
      moneda: "USD",
    },
    status: 422,
    error:
      'El uso de CFDI "G03" no es válido para el régimen fiscal 616 del receptor. Corrige el uso de CFDI del cliente o de la factura antes de timbrar.',
  },
  {
    name: "missing global precedes FX",
    invoice: { moneda: "USD" },
    status: 400,
    error:
      "Faltan datos de Información Global (Público en General): periodicidad, meses, año. Captúralos en el formulario de la factura antes de timbrar.",
    release: missingGlobal,
  },
  {
    name: "FX precedes invalid periodicity",
    invoice: {
      global_periodicity: "bad",
      global_months: "10",
      global_year: 2026,
      moneda: "USD",
      tipo_cambio: 1,
    },
    status: 422,
    error: invalidFx,
  },
  {
    name: "invalid periodicity after valid FX",
    invoice: {
      global_periodicity: "bad",
      global_months: "10",
      global_year: 2026,
    },
    status: 400,
    error: 'Periodicidad global inválida: "bad". Debe ser código SAT 01-05.',
  },
];
