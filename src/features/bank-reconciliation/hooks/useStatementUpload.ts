import { useCallback, useRef, useState } from "react";
import { notifyError } from "@/lib/ui/appFeedback";
import { BankStatementLineLimitError, type ParseResult } from "../lib/bankParseUtils";
import { type StatementProfile, XML_PROFILES } from "../lib/bankReconciliationConstants";
import { parseBankCsv } from "../lib/csvParsers";
import { decodeStatementFile } from "../lib/decodeStatementFile";
import { parseBankXml, type XmlFieldMapping } from "../lib/xmlParsers";
import { useImportBankStatement } from "./useBankReconciliationMutations";

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

function mappingSignature(mapping: XmlFieldMapping): string {
  return Object.entries(mapping)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join("|");
}

interface AnalyzedUpload {
  uploadId: string;
  bankAccountId: string;
  file: File;
  profile: StatementProfile;
  isXml: boolean;
  mappingSignature: string;
  result: ParseResult;
}

// Este hook mantiene un único ciclo cancelable análisis→mapeo→confirmación;
// separarlo duplicaría los tokens de generación que evitan resultados obsoletos.
// eslint-disable-next-line max-lines-per-function
export function useStatementUpload(bankAccountId: string) {
  const [profile, setProfile] = useState<StatementProfile>("generico");
  const [file, setFile] = useState<File | null>(null);
  const [analyzed, setAnalyzed] = useState<AnalyzedUpload | null>(null);
  const [xmlFields, setXmlFields] = useState<string[]>([]);
  const [mapping, setMapping] = useState<XmlFieldMapping>({});
  const [content, setContent] = useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const generationRef = useRef(0);
  const activeRunRef = useRef<number | null>(null);
  const importMut = useImportBankStatement();
  const preview = analyzed?.result ?? null;

  const runXml = useCallback(async (text: string, override: XmlFieldMapping) => {
    return await parseBankXml(text, override, MAX_PARSED_LINES);
  }, []);

  const startRun = useCallback((supersede: boolean): number | null => {
    if (!supersede && activeRunRef.current !== null) return null;
    const runId = generationRef.current + 1;
    generationRef.current = runId;
    activeRunRef.current = runId;
    setIsAnalyzing(true);
    setAnalyzed(null);
    return runId;
  }, []);

  const finishRun = useCallback((runId: number) => {
    if (activeRunRef.current !== runId) return;
    activeRunRef.current = null;
    setIsAnalyzing(false);
  }, []);

  const isCurrentRun = useCallback(
    (runId: number) => generationRef.current === runId,
    [],
  );

  // Las ramas corresponden a límites, formato, cancelación y feedback distintos.
  // eslint-disable-next-line complexity
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
    const runId = startRun(false);
    if (runId === null) return;
    const analyzedFile = file;
    const analyzedProfile = profile;
    try {
      const text = await decodeStatementFile(analyzedFile);
      if (!isCurrentRun(runId)) return;
      setContent(text);
      const useXml = isXml(text)
        || XML_PROFILES.includes(analyzedProfile)
        || analyzedFile.name.toLowerCase().endsWith(".xml");
      const savedMapping = useXml ? loadMapping(bankAccountId) : {};
      // Los parsers reciben el límite y cortan antes del bucle de hashes.
      let parsed: ParseResult;
      let effectiveMapping: XmlFieldMapping = {};
      if (useXml) {
        const xmlParsed = await runXml(text, savedMapping);
        parsed = xmlParsed;
        effectiveMapping = { ...xmlParsed.detectedMapping, ...savedMapping };
      } else {
        parsed = await parseBankCsv(text, analyzedProfile, MAX_PARSED_LINES);
      }
      if (!isCurrentRun(runId)) return;
      if (tooManyLines(parsed)) throw new BankStatementLineLimitError(parsed.lines.length, MAX_PARSED_LINES);
      if (useXml) {
        const xmlParsed = parsed as Awaited<ReturnType<typeof parseBankXml>>;
        setXmlFields(xmlParsed.availableFields);
        setMapping(effectiveMapping);
      } else {
        setXmlFields([]);
      }
      setAnalyzed({
        uploadId: crypto.randomUUID(),
        bankAccountId,
        file: analyzedFile,
        profile: analyzedProfile,
        isXml: useXml,
        mappingSignature: useXml ? mappingSignature(effectiveMapping) : "",
        result: parsed,
      });
      if (parsed.lines.length === 0 && !useXml) {
        notifyError({
          title: "No se pudieron leer movimientos del archivo",
          description: parsed.errors[0] ?? "Sin detalle.",
          phase: "parseBankStatement",
          severity: "warning",
          context: { profile: analyzedProfile, fileName: analyzedFile.name },
        });
      }
    } catch (error) {
      if (!isCurrentRun(runId)) return;
      setAnalyzed(null);
      if (error instanceof BankStatementLineLimitError) {
        notifyError({
          title: "Archivo con demasiados movimientos",
          description: `El archivo tiene más de ${MAX_PARSED_LINES.toLocaleString("es-MX")} líneas; divídelo por período antes de importarlo.`,
          phase: "parseBankStatement",
          severity: "warning",
          context: { profile: analyzedProfile, fileName: analyzedFile.name, lineCount: error.lineCount },
        });
        return;
      }
      notifyError({
        error,
        title: "No se pudo analizar el estado de cuenta",
        phase: "parseBankStatement",
        context: { profile: analyzedProfile, fileName: analyzedFile.name },
      });
    } finally {
      finishRun(runId);
    }
  }, [bankAccountId, file, finishRun, isCurrentRun, profile, runXml, startRun]);

  const remap = useCallback((next: XmlFieldMapping) => {
    if (!file || !content) return;
    saveMapping(bankAccountId, next);
    setMapping(next);
    const runId = startRun(true);
    if (runId === null) return;
    const analyzedFile = file;
    const analyzedProfile = profile;
    const analyzedContent = content;
    void (async () => {
      try {
        const parsed = await runXml(analyzedContent, next);
        if (!isCurrentRun(runId)) return;
        const effectiveMapping = { ...parsed.detectedMapping, ...next };
        setXmlFields(parsed.availableFields);
        setMapping(effectiveMapping);
        setAnalyzed({
          uploadId: crypto.randomUUID(),
          bankAccountId,
          file: analyzedFile,
          profile: analyzedProfile,
          isXml: true,
          mappingSignature: mappingSignature(effectiveMapping),
          result: parsed,
        });
      } catch (error: unknown) {
        if (!isCurrentRun(runId)) return;
        setAnalyzed(null);
        notifyError({ error, title: "No se pudo aplicar el mapeo XML", phase: "parseBankStatement" });
      } finally {
        finishRun(runId);
      }
    })();
  }, [bankAccountId, content, file, finishRun, isCurrentRun, profile, runXml, startRun]);

  const reset = useCallback(() => {
    generationRef.current += 1;
    setFile(null); setAnalyzed(null); setXmlFields([]); setContent(""); setMapping({});
  }, []);

  const changeFile = useCallback((next: File | null) => {
    generationRef.current += 1;
    setFile(next); setAnalyzed(null); setXmlFields([]); setContent(""); setMapping({});
  }, []);

  const changeProfile = useCallback((next: StatementProfile) => {
    generationRef.current += 1;
    setProfile(next); setAnalyzed(null); setXmlFields([]); setContent(""); setMapping({});
  }, []);

  const confirm = useCallback(() => {
    if (!analyzed || !file || analyzed.result.lines.length === 0) return;
    const identityMatches = analyzed.file === file
      && analyzed.bankAccountId === bankAccountId
      && analyzed.profile === profile
      && (!analyzed.isXml || analyzed.mappingSignature === mappingSignature(mapping));
    if (!identityMatches) {
      setAnalyzed(null);
      notifyError({
        title: "El archivo cambió después del análisis",
        description: "Analiza nuevamente el archivo antes de importarlo.",
        phase: "importBankStatement",
        severity: "warning",
      });
      return;
    }
    importMut.mutate(
      {
        uploadId: analyzed.uploadId,
        bankAccountId,
        fileName: file.name,
        lines: analyzed.result.lines,
        periodStart: analyzed.result.periodStart,
        periodEnd: analyzed.result.periodEnd,
      },
      { onSuccess: reset },
    );
  }, [analyzed, bankAccountId, file, importMut, mapping, profile, reset]);

  return {
    profile, setProfile: changeProfile, file, setFile: changeFile,
    preview, xmlFields, mapping,
    analyze, remap, confirm, reset,
    isAnalyzing,
    isPending: importMut.isPending,
  };
}
