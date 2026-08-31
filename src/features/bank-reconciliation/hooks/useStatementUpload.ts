import { useCallback, useState } from "react";
import { notifyError } from "@/lib/ui/appFeedback";
import { type StatementProfile, XML_PROFILES } from "../lib/bankReconciliationConstants";
import { parseBankCsv } from "../lib/csvParsers";
import { decodeStatementFile } from "../lib/decodeStatementFile";
import { parseBankXml, type XmlFieldMapping } from "../lib/xmlParsers";
import { useImportBankStatement } from "./useBankReconciliationMutations";
import type { ParseResult } from "../lib/bankParseUtils";

const mappingKey = (bankAccountId: string) => `liftgo:bank-xml-mapping:${bankAccountId}`;

// Fix 6.3: archivos gigantes (tanto en bytes como en cantidad de líneas)
// congelaban la pestaña al intentar parsearlos/renderizarlos en el cliente.
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_PARSED_LINES = 50_000;

function loadMapping(bankAccountId: string): XmlFieldMapping {
  try {
    const raw = localStorage.getItem(mappingKey(bankAccountId));
    return raw ? (JSON.parse(raw) as XmlFieldMapping) : {};
  } catch {
    return {};
  }
}

function saveMapping(bankAccountId: string, mapping: XmlFieldMapping) {
  try {
    localStorage.setItem(mappingKey(bankAccountId), JSON.stringify(mapping));
  } catch {
    /* almacenamiento no disponible: el mapeo simplemente no se recuerda */
  }
}

const isXml = (content: string) => content.trimStart().startsWith("<");

function tooManyLines(result: ParseResult): boolean {
  return result.lines.length > MAX_PARSED_LINES;
}

export function useStatementUpload(bankAccountId: string) {
  const [profile, setProfile] = useState<StatementProfile>("generico");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [xmlFields, setXmlFields] = useState<string[]>([]);
  const [mapping, setMapping] = useState<XmlFieldMapping>({});
  const [content, setContent] = useState<string>("");
  const importMut = useImportBankStatement();

  const runXml = useCallback(async (text: string, override: XmlFieldMapping) => {
    const parsed = await parseBankXml(text, override);
    setXmlFields(parsed.availableFields);
    setMapping({ ...parsed.detectedMapping, ...override });
    setPreview(parsed);
    return parsed;
  }, []);

  const analyze = useCallback(async () => {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE_BYTES) {
      notifyError({
        title: "Archivo demasiado grande",
        description: "El estado de cuenta excede 10 MB; divídelo por período.",
        phase: "parseBankStatement",
        severity: "warning",
        context: { fileName: file.name, fileSize: file.size },
      });
      return;
    }
    const text = await decodeStatementFile(file);
    setContent(text);
    const useXml = isXml(text) || XML_PROFILES.includes(profile) || file.name.toLowerCase().endsWith(".xml");
    const parsed = useXml ? await runXml(text, loadMapping(bankAccountId)) : await parseBankCsv(text, profile);
    if (!useXml) { setXmlFields([]); setPreview(parsed); }
    if (tooManyLines(parsed)) {
      setPreview(null);
      notifyError({
        title: "Archivo con demasiados movimientos",
        description: `El archivo tiene más de ${MAX_PARSED_LINES.toLocaleString("es-MX")} líneas; divídelo por período antes de importarlo.`,
        phase: "parseBankStatement",
        severity: "warning",
        context: { profile, fileName: file.name, lineCount: parsed.lines.length },
      });
      return;
    }
    if (parsed.lines.length === 0 && !useXml) {
      notifyError({
        title: "No se pudieron leer movimientos del archivo",
        description: parsed.errors[0] ?? "Sin detalle.",
        phase: "parseBankStatement",
        severity: "warning",
        context: { profile, fileName: file.name },
      });
    }
  }, [bankAccountId, file, profile, runXml]);

  const remap = useCallback((next: XmlFieldMapping) => {
    saveMapping(bankAccountId, next);
    void runXml(content, next);
  }, [bankAccountId, content, runXml]);

  const reset = useCallback(() => {
    setFile(null); setPreview(null); setXmlFields([]); setContent("");
  }, []);

  const confirm = useCallback(() => {
    if (!preview || !file || preview.lines.length === 0) return;
    importMut.mutate(
      { bankAccountId, fileName: file.name, lines: preview.lines, periodStart: preview.periodStart, periodEnd: preview.periodEnd },
      { onSuccess: reset },
    );
  }, [bankAccountId, file, importMut, preview, reset]);

  return { profile, setProfile, file, setFile, preview, xmlFields, mapping, analyze, remap, confirm, reset, isPending: importMut.isPending };
}
