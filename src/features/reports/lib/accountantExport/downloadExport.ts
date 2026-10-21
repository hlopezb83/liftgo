import { notifySuccess } from "@/lib/ui/appFeedback";
import { saveAccountantWorkbook } from "./writeWorkbook";
import type { ExportData, ExportOptions, ExportSheet } from "./model";

export async function downloadAccountantExport(options: ExportOptions, data: ExportData, sheets: ExportSheet[], signal: AbortSignal,
  isCurrent: () => boolean, onProgress: (done: number, total: number) => void): Promise<string> {
  if (options.includeDocuments) {
    const { buildAccountantPackage, saveAccountantPackage } = await import("./buildPackage");
    signal.throwIfAborted();
    const result = await buildAccountantPackage(options, data, sheets, signal, onProgress);
    if (!isCurrent()) throw new Error("El contexto cambió. Vuelve a exportar.");
    await saveAccountantPackage(result, `liftgo-contador-${options.start}-${options.end}`, isCurrent);
    const message = result.incomplete
      ? `Paquete INCOMPLETO: ${result.included} archivos incluidos y ${result.missing} no incluidos. Revisa la hoja Archivos y el índice.`
      : `Paquete descargado con ${result.included} archivos. Revisa Control antes de compartirlo.`;
    if (!result.incomplete) notifySuccess(message);
    return message;
  }
  await saveAccountantWorkbook(sheets, `liftgo-contador-${options.start}-${options.end}.xlsx`, isCurrent);
  const message = "Excel descargado. Revisa la hoja Control antes de compartirlo.";
  if (isCurrent()) notifySuccess(message);
  return message;
}
