/**
 * A4B-08 / A4B-09: catálogo de regímenes fiscales del SAT (CFDI 4.0) con su
 * aplicabilidad a persona física / persona moral, según el Anexo 20 del SAT.
 *
 * Reutiliza los códigos/etiquetas de `REGIMEN_FISCAL` (dropdowns existentes en
 * `@/lib/domain/satCatalogs`) para no duplicar la fuente de verdad visual, y
 * agrega la información de aplicabilidad que faltaba para validar contra el
 * tipo de persona derivado de la longitud del RFC (12 = moral, 13 = física).
 */
import { REGIMEN_FISCAL } from "@/lib/domain/satCatalogs";

export type TipoPersona = "fisica" | "moral";

interface RegimenFiscalDef {
  code: string;
  label: string;
  aplicaFisica: boolean;
  aplicaMoral: boolean;
}

const APLICABILIDAD: Record<string, { aplicaFisica: boolean; aplicaMoral: boolean }> = {
  "601": { aplicaFisica: false, aplicaMoral: true }, // General de Ley Personas Morales
  "603": { aplicaFisica: false, aplicaMoral: true }, // Personas Morales con Fines no Lucrativos
  "605": { aplicaFisica: true, aplicaMoral: false }, // Sueldos y Salarios
  "606": { aplicaFisica: true, aplicaMoral: true }, // Arrendamiento
  "608": { aplicaFisica: true, aplicaMoral: true }, // Demás ingresos
  "610": { aplicaFisica: true, aplicaMoral: true }, // Residentes en el Extranjero
  "612": { aplicaFisica: true, aplicaMoral: false }, // Actividades Empresariales y Profesionales
  "614": { aplicaFisica: true, aplicaMoral: true }, // Ingresos por Intereses
  "616": { aplicaFisica: true, aplicaMoral: false }, // Sin obligaciones fiscales
  "620": { aplicaFisica: false, aplicaMoral: true }, // Sociedades Cooperativas de Producción
  "621": { aplicaFisica: true, aplicaMoral: false }, // Incorporación Fiscal
  "622": { aplicaFisica: true, aplicaMoral: true }, // Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras
  "623": { aplicaFisica: false, aplicaMoral: true }, // Opcional para Grupos de Sociedades
  "624": { aplicaFisica: false, aplicaMoral: true }, // Coordinados
  "625": { aplicaFisica: true, aplicaMoral: false }, // Plataformas Tecnológicas
  "626": { aplicaFisica: true, aplicaMoral: true }, // Régimen Simplificado de Confianza
};

export const REGIMEN_FISCAL_CATALOG: RegimenFiscalDef[] = REGIMEN_FISCAL.map((r) => ({
  code: r.code,
  label: r.label,
  ...(APLICABILIDAD[r.code] ?? { aplicaFisica: true, aplicaMoral: true }),
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
