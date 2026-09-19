import { type StatementProfile, XML_PROFILES } from "../../lib/bankReconciliationConstants";
import { parseBankCsv } from "../../lib/csvParsers";
import { decodeStatementFile } from "../../lib/decodeStatementFile";
import { parseBankXml, type XmlFieldMapping } from "../../lib/xmlParsers";
import { MAX_PARSED_LINES } from "./limits";
import { loadMapping } from "./mappingStorage";
import type { ParseResult } from "../../lib/bankParseUtils";

/** Un XML siempre abre con `<`, aun cuando el perfil o la extensión digan otra cosa. */
export const isXmlContent = (content: string) => content.trimStart().startsWith("<");

export function shouldUseXml(text: string, profile: StatementProfile, fileName: string): boolean {
  return isXmlContent(text)
    || XML_PROFILES.includes(profile)
    || fileName.toLowerCase().endsWith(".xml");
}

/** Firma estable del mapeo: permite detectar que el análisis quedó obsoleto. */
export function mappingSignature(mapping: XmlFieldMapping): string {
  return Object.entries(mapping)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join("|");
}

export function parseXmlWithLimit(text: string, override: XmlFieldMapping) {
  return parseBankXml(text, override, MAX_PARSED_LINES);
}

export interface AnalysisOutcome {
  useXml: boolean;
  parsed: ParseResult;
  effectiveMapping: XmlFieldMapping;
  availableFields: string[];
}

interface AnalysisInput {
  file: File;
  profile: StatementProfile;
  bankAccountId: string;
}

/**
 * Decodifica y parsea el archivo. `onDecoded` publica el texto y decide si la
 * ejecución sigue vigente; si devuelve `false` el análisis se cancela.
 */
export async function runStatementAnalysis(
  { file, profile, bankAccountId }: AnalysisInput,
  onDecoded: (text: string) => boolean,
): Promise<AnalysisOutcome | null> {
  const text = await decodeStatementFile(file);
  if (!onDecoded(text)) return null;
  const useXml = shouldUseXml(text, profile, file.name);
  // Los parsers reciben el límite y cortan antes del bucle de hashes.
  if (!useXml) {
    const parsed = await parseBankCsv(text, profile, MAX_PARSED_LINES);
    return { useXml: false, parsed, effectiveMapping: {}, availableFields: [] };
  }
  const savedMapping = loadMapping(bankAccountId);
  const xmlParsed = await parseXmlWithLimit(text, savedMapping);
  return {
    useXml: true,
    parsed: xmlParsed,
    effectiveMapping: { ...xmlParsed.detectedMapping, ...savedMapping },
    availableFields: xmlParsed.availableFields,
  };
}
