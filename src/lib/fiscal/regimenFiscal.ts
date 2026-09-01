/**
 * A4B-08 / A4B-09: catálogo de regímenes fiscales del SAT (CFDI 4.0) con su
 * aplicabilidad a persona física / persona moral, según el Anexo 20 del SAT.
 *
 * Reutiliza los códigos/etiquetas de `REGIMEN_FISCAL` (dropdowns existentes en
 * `@/lib/domain/satCatalogs`) para no duplicar la fuente de verdad visual, y
 * agrega la información de aplicabilidad que faltaba para validar contra el
 * tipo de persona derivado de la longitud del RFC (12 = moral, 13 = física).
 *
 * R9-12: la matriz de aplicabilidad se verificó contra la FUENTE OFICIAL del
 * SAT (descarga directa, 2026-09-01):
 *   http://omawww.sat.gob.mx/tramitesyservicios/Paginas/anexo_20_version3-3.htm
 *   → catCFDI_V_4_23032023.xls  (hoja c_RegimenFiscal, CFDI 4.0)
 *   → catCFDI_V_33_23032023.xls (hoja c_RegimenFiscal, incluye 629 y 630)
 * En el archivo del SAT, 629 ("De los Regímenes Fiscales Preferentes y de las
 * Empresas Multinacionales") y 630 ("Enajenación de acciones en bolsa de
 * valores") están publicados con Física="Sí", Moral="No" y fecha de inicio de
 * vigencia 01-01-2024. No se usan réplicas de terceros como fuente.
 */
import { REGIMEN_FISCAL } from "@/lib/domain/satCatalogs";

export type TipoPersona = "fisica" | "moral";

interface RegimenFiscalDef {
  code: string;
  label: string;
  aplicaFisica: boolean;
  aplicaMoral: boolean;
}

/**
 * R8-09: aplicabilidad explícita para TODOS los códigos vigentes del catálogo.
 * Antes, los códigos sin entrada (607, 609, 611, 615, 628, 629, 630) caían en
 * un fallback permisivo `{fisica:true, moral:true}` y dejaban pasar combinaciones
 * inválidas que el PAC rechazaba después.
 */
const APLICABILIDAD: Record<string, { aplicaFisica: boolean; aplicaMoral: boolean }> = {
  "601": { aplicaFisica: false, aplicaMoral: true }, // General de Ley Personas Morales
  "603": { aplicaFisica: false, aplicaMoral: true }, // Personas Morales con Fines no Lucrativos
  "605": { aplicaFisica: true, aplicaMoral: false }, // Sueldos y Salarios
  "606": { aplicaFisica: true, aplicaMoral: true }, // Arrendamiento
  "607": { aplicaFisica: true, aplicaMoral: false }, // Enajenación o Adquisición de Bienes
  "608": { aplicaFisica: true, aplicaMoral: true }, // Demás ingresos
  "609": { aplicaFisica: false, aplicaMoral: true }, // Consolidación
  "610": { aplicaFisica: true, aplicaMoral: true }, // Residentes en el Extranjero
  "611": { aplicaFisica: true, aplicaMoral: false }, // Ingresos por Dividendos
  "612": { aplicaFisica: true, aplicaMoral: false }, // Actividades Empresariales y Profesionales
  "614": { aplicaFisica: true, aplicaMoral: true }, // Ingresos por Intereses
  "615": { aplicaFisica: true, aplicaMoral: false }, // Ingresos por obtención de premios
  "616": { aplicaFisica: true, aplicaMoral: false }, // Sin obligaciones fiscales
  "620": { aplicaFisica: false, aplicaMoral: true }, // Sociedades Cooperativas de Producción
  "621": { aplicaFisica: true, aplicaMoral: false }, // Incorporación Fiscal
  "622": { aplicaFisica: true, aplicaMoral: true }, // Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras
  "623": { aplicaFisica: false, aplicaMoral: true }, // Opcional para Grupos de Sociedades
  "624": { aplicaFisica: false, aplicaMoral: true }, // Coordinados
  "625": { aplicaFisica: true, aplicaMoral: false }, // Plataformas Tecnológicas
  "626": { aplicaFisica: true, aplicaMoral: true }, // Régimen Simplificado de Confianza
  "628": { aplicaFisica: false, aplicaMoral: true }, // Hidrocarburos
  // R9-12: corregido de {true,true} a solo persona física. Evidencia oficial
  // verificada el 2026-09-01 descargando el catálogo del SAT desde
  // omawww.sat.gob.mx (catCFDI_V_33_23032023.xls, hoja c_RegimenFiscal):
  // 629 y 630 aparecen con Física="Sí", Moral="No", vigencia 01-01-2024.
  "629": { aplicaFisica: true, aplicaMoral: false }, // Regímenes Fiscales Preferentes y Empresas Multinacionales (solo física)
  "630": { aplicaFisica: true, aplicaMoral: false }, // Enajenación de acciones en bolsa de valores (solo física)
};

export const REGIMEN_FISCAL_CATALOG: RegimenFiscalDef[] = REGIMEN_FISCAL.map((r) => ({
  code: r.code,
  label: r.label,
  // Sin fallback permisivo: un código sin matriz explícita no aplica a nadie
  // (falla cerrado) y el test de cobertura obliga a declararlo.
  ...(APLICABILIDAD[r.code] ?? { aplicaFisica: false, aplicaMoral: false }),
}));


const BY_CODE = new Map(REGIMEN_FISCAL_CATALOG.map((r) => [r.code, r]));

/** true si el código existe en el catálogo vigente del SAT. */
export function isValidRegimenFiscalCode(code: string): boolean {
  return BY_CODE.has(code);
}

/** Deriva el tipo de persona a partir de la longitud del RFC (12 = moral, 13 = física). */
export function tipoPersonaFromRfc(rfc: string): TipoPersona | null {
  const len = rfc.trim().length;
  if (len === 12) return "moral";
  if (len === 13) return "fisica";
  return null;
}

/** true si el régimen aplica para el tipo de persona dado. */
export function regimenAplicaPersona(code: string, tipoPersona: TipoPersona): boolean {
  const def = BY_CODE.get(code);
  if (!def) return false;
  return tipoPersona === "fisica" ? def.aplicaFisica : def.aplicaMoral;
}
