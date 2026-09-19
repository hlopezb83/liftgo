import { notifyError } from "@/lib/ui/appFeedback";
import { BankStatementLineLimitError } from "../../lib/bankParseUtils";
import { MAX_PARSED_LINES } from "./limits";
import type { StatementProfile } from "../../lib/bankReconciliationConstants";

interface AnalysisContext {
  profile: StatementProfile;
  fileName: string;
}

export function notifyFileTooLarge(file: File) {
  notifyError({
    title: "Archivo demasiado grande",
    description: "El estado de cuenta excede 10 MB; divídelo por período.",
    phase: "parseBankStatement",
    severity: "warning",
    context: { fileName: file.name, fileSize: file.size },
  });
}

export function notifyEmptyStatement({ profile, fileName }: AnalysisContext, firstError?: string) {
  notifyError({
    title: "No se pudieron leer movimientos del archivo",
    description: firstError ?? "Sin detalle.",
    phase: "parseBankStatement",
    severity: "warning",
    context: { profile, fileName },
  });
}

export function notifyAnalysisFailure(error: unknown, { profile, fileName }: AnalysisContext) {
  if (error instanceof BankStatementLineLimitError) {
    notifyError({
      title: "Archivo con demasiados movimientos",
      description: `El archivo tiene más de ${MAX_PARSED_LINES.toLocaleString("es-MX")} líneas; divídelo por período antes de importarlo.`,
      phase: "parseBankStatement",
      severity: "warning",
      context: { profile, fileName, lineCount: error.lineCount },
    });
    return;
  }
  notifyError({
    error,
    title: "No se pudo analizar el estado de cuenta",
    phase: "parseBankStatement",
    context: { profile, fileName },
  });
}

export function notifyRemapFailure(error: unknown) {
  notifyError({ error, title: "No se pudo aplicar el mapeo XML", phase: "parseBankStatement" });
}

export function notifyStaleAnalysis() {
  notifyError({
    title: "El archivo cambió después del análisis",
    description: "Analiza nuevamente el archivo antes de importarlo.",
    phase: "importBankStatement",
    severity: "warning",
  });
}
