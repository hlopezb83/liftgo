// A4B-07: tabla MÍNIMA de compatibilidad Uso CFDI ↔ Régimen Fiscal del SAT
// (Anexo 20 / catálogo c_UsoCFDI). No es el catálogo completo — sólo cubre
// los regímenes con reglas conocidas de incompatibilidad para bloquear el
// caso reportado (G03 timbrado por default contra receptores en 616, que
// el SAT rechaza). Regímenes NO listados aquí se consideran compatibles con
// cualquier uso (permisivo) para no romper flujos existentes.
//
// Fuente: Anexo 20 (c_UsoCFDI) / matriz pública de usos por régimen.
// Ampliar esta tabla es responsabilidad de otro ingeniero si se detectan
// más incompatibilidades — mantenerla mínima evita falsos rechazos.

const USOS_GENERALES = [
  "G01",
  "G02",
  "G03",
  "I01",
  "I02",
  "I03",
  "I04",
  "I05",
  "I06",
  "I07",
  "I08",
  "S01",
  "CP01",
];

const USOS_DEDUCCIONES_PERSONALES = [
  "D01",
  "D02",
  "D03",
  "D04",
  "D05",
  "D06",
  "D07",
  "D08",
  "D09",
  "D10",
  "S01",
  "CP01",
  "CN01",
];

// Regímenes con matriz de usos restringida conocida.
export const USOS_POR_REGIMEN: Record<string, ReadonlyArray<string>> = {
  // 605: Sueldos y Salarios — sólo deducciones personales / nómina.
  "605": USOS_DEDUCCIONES_PERSONALES,
  // 616: Sin obligaciones fiscales — el SAT SÓLO admite S01 y CP01.
  // Éste es el caso reportado en A4B-07 (G03 se rechazaba con este régimen).
  "616": ["S01", "CP01"],
};

/**
 * true si el uso CFDI es compatible con el régimen fiscal del receptor.
 * Regímenes ausentes de `USOS_POR_REGIMEN` se consideran compatibles con
 * cualquier uso (tabla mínima, no exhaustiva — ver comentario arriba).
 */
export function isUsoCfdiCompatible(
  usoCfdi: string | null | undefined,
  regimenFiscal: string | null | undefined,
): boolean {
  const uso = String(usoCfdi ?? "").toUpperCase().trim();
  const regimen = String(regimenFiscal ?? "").trim();
  if (!uso || !regimen) return true; // validado en otro lado (datos faltantes)
  const allowed = USOS_POR_REGIMEN[regimen];
  if (!allowed) return true; // régimen sin regla conocida → permisivo
  return allowed.includes(uso);
}

export { USOS_GENERALES };
