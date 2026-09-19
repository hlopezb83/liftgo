import { useCallback, useRef, useState } from "react";
import { BankStatementLineLimitError } from "../lib/bankParseUtils";
import type { StatementProfile } from "../lib/bankReconciliationConstants";
import type { XmlFieldMapping } from "../lib/xmlParsers";
import {
  type AnalysisOutcome,
  parseXmlWithLimit,
  runStatementAnalysis,
} from "./statementUpload/analysis";
import { type AnalyzedUpload, analysisMatchesIdentity, buildAnalyzedUpload } from "./statementUpload/analyzedUpload";
import {
  notifyAnalysisFailure,
  notifyEmptyStatement,
  notifyFileTooLarge,
  notifyRemapFailure,
  notifyStaleAnalysis,
} from "./statementUpload/feedback";
import { exceedsSizeLimit, MAX_PARSED_LINES, tooManyLines } from "./statementUpload/limits";
import { saveMapping } from "./statementUpload/mappingStorage";
import { useImportBankStatement } from "./useBankReconciliationMutations";

export { MAX_FILE_SIZE_BYTES, MAX_PARSED_LINES } from "./statementUpload/limits";

/**
 * Orquesta el ciclo cancelable análisis→mapeo→confirmación. La decodificación,
 * el parseo, los límites, el localStorage del mapeo y los mensajes viven en
 * `./statementUpload/*`; aquí sólo queda el estado y las transiciones.
 */
export function useStatementUpload(bankAccountId: string) {
  const [profile, setProfile] = useState<StatementProfile>("generico");
  const [file, setFile] = useState<File | null>(null);
  const [analyzed, setAnalyzed] = useState<AnalyzedUpload | null>(null);
  const [xmlFields, setXmlFields] = useState<string[]>([]);
  const [mapping, setMapping] = useState<XmlFieldMapping>({});
  const [content, setContent] = useState<string>("");
  const clearAnalyzed = useCallback(() => setAnalyzed(null), []);
  const { isAnalyzing, startRun, finishRun, isCurrentRun, invalidateRuns } = useAnalysisRun(clearAnalyzed);
  const importMut = useImportBankStatement();
  const preview = analyzed?.result ?? null;


  const publishOutcome = useCallback(
    (outcome: AnalysisOutcome, analyzedFile: File, analyzedProfile: StatementProfile) => {
      if (outcome.useXml) {
        setXmlFields(outcome.availableFields);
        setMapping(outcome.effectiveMapping);
      } else {
        setXmlFields([]);
      }
      setAnalyzed(buildAnalyzedUpload({
        bankAccountId,
        file: analyzedFile,
        profile: analyzedProfile,
        isXml: outcome.useXml,
        effectiveMapping: outcome.effectiveMapping,
        result: outcome.parsed,
      }));
    },
    [bankAccountId],
  );

  const analyze = useCallback(async () => {
    if (!file) return;
    if (exceedsSizeLimit(file)) {
      notifyFileTooLarge(file);
      return;
    }
    const runId = startRun(false);
    if (runId === null) return;
    const analyzedFile = file;
    const analyzedProfile = profile;
    const context = { profile: analyzedProfile, fileName: analyzedFile.name };
    try {
      const outcome = await runStatementAnalysis(
        { file: analyzedFile, profile: analyzedProfile, bankAccountId },
        (text) => {
          if (!isCurrentRun(runId)) return false;
          setContent(text);
          return true;
        },
      );
      if (!outcome || !isCurrentRun(runId)) return;
      if (tooManyLines(outcome.parsed)) {
        throw new BankStatementLineLimitError(outcome.parsed.lines.length, MAX_PARSED_LINES);
      }
      publishOutcome(outcome, analyzedFile, analyzedProfile);
      if (outcome.parsed.lines.length === 0 && !outcome.useXml) {
        notifyEmptyStatement(context, outcome.parsed.errors[0]);
      }
    } catch (error) {
      if (!isCurrentRun(runId)) return;
      setAnalyzed(null);
      notifyAnalysisFailure(error, context);
    } finally {
      finishRun(runId);
    }
  }, [bankAccountId, file, finishRun, isCurrentRun, profile, publishOutcome, startRun]);

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
        const parsed = await parseXmlWithLimit(analyzedContent, next);
        if (!isCurrentRun(runId)) return;
        publishOutcome(
          {
            useXml: true,
            parsed,
            effectiveMapping: { ...parsed.detectedMapping, ...next },
            availableFields: parsed.availableFields,
          },
          analyzedFile,
          analyzedProfile,
        );
      } catch (error: unknown) {
        if (!isCurrentRun(runId)) return;
        setAnalyzed(null);
        notifyRemapFailure(error);
      } finally {
        finishRun(runId);
      }
    })();
  }, [bankAccountId, content, file, finishRun, isCurrentRun, profile, publishOutcome, startRun]);

  const clearAnalysis = useCallback(() => {
    generationRef.current += 1;
    setAnalyzed(null); setXmlFields([]); setContent(""); setMapping({});
  }, []);

  const reset = useCallback(() => {
    clearAnalysis();
    setFile(null);
  }, [clearAnalysis]);

  const changeFile = useCallback((next: File | null) => {
    clearAnalysis();
    setFile(next);
  }, [clearAnalysis]);

  const changeProfile = useCallback((next: StatementProfile) => {
    clearAnalysis();
    setProfile(next);
  }, [clearAnalysis]);

  const confirm = useCallback(() => {
    if (!analyzed || !file || analyzed.result.lines.length === 0) return;
    if (!analysisMatchesIdentity(analyzed, { file, bankAccountId, profile, mapping })) {
      setAnalyzed(null);
      notifyStaleAnalysis();
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
