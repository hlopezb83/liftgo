import { useCallback, useState } from "react";
import { notifyError } from "@/lib/ui/appFeedback";
import { type StatementProfile, XML_PROFILES } from "../lib/bankReconciliationConstants";
import { parseBankCsv } from "../lib/csvParsers";
import { parseBankXml, type XmlFieldMapping } from "../lib/xmlParsers";
import { useImportBankStatement } from "./useBankReconciliationMutations";
import type { ParseResult } from "../lib/bankParseUtils";

const mappingKey = (bankAccountId: string) => `liftgo:bank-xml-mapping:${bankAccountId}`;

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

export function useStatementUpload(bankAccountId: string) {
  const [profile, setProfile] = useState<StatementProfile>("generico");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParseResult | null>(null);
  const [xmlFields, setXmlFields] = useState<string[]>([]);
  const [mapping, setMapping] = useState<XmlFieldMapping>({});
  const [content, setContent] = useState<string>("");
  const importMut = useImportBankStatement();

  const runXml = useCallback((text: string, override: XmlFieldMapping) => {
    const parsed = parseBankXml(text, override);
    setXmlFields(parsed.availableFields);
    setMapping({ ...parsed.detectedMapping, ...override });
    setPreview(parsed);
    return parsed;
  }, []);

  const analyze = useCallback(async () => {
    if (!file) return;
    const text = await file.text();
    setContent(text);
    const useXml = isXml(text) || XML_PROFILES.includes(profile) || file.name.toLowerCase().endsWith(".xml");
    const parsed = useXml ? runXml(text, loadMapping(bankAccountId)) : parseBankCsv(text, profile);
    if (!useXml) { setXmlFields([]); setPreview(parsed); }
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
    runXml(content, next);
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
