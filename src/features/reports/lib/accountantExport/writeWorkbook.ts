import { exportInWorker } from "@/lib/exportInWorker";
import type { ExportSheet } from "./model";
import type { WorkBook } from "@e965/xlsx";

export async function createAccountantWorkbook(sheets: ExportSheet[]): Promise<WorkBook> {
  const workbook = await import("./workbookBytes");
  return workbook.createAccountantWorkbook(sheets);
}

/** Both standalone downloads and ZIP packages use this exact presentation pipeline. */
export async function serializeAccountantWorkbook(sheets: ExportSheet[]): Promise<Uint8Array> {
  const bytes = await exportInWorker<ExportSheet[], Uint8Array>(
    () => new Worker(new URL("./workbook.worker.ts", import.meta.url), { type: "module" }),
    sheets,
  );
  return bytes ?? (await import("./workbookBytes")).buildAccountantWorkbookBytes(sheets);
}

export async function saveAccountantWorkbook(sheets: ExportSheet[], filename: string, shouldSave: () => boolean): Promise<void> {
  if (!shouldSave()) throw new Error("El contexto cambió. Vuelve a exportar.");
  const bytes = await serializeAccountantWorkbook(sheets);
  // Process queued cancellation/identity events before the irreversible browser download.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  if (!shouldSave()) throw new Error("El contexto cambió. Vuelve a exportar.");
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  try {
    const a = document.createElement("a"); a.href = url; a.download = filename; a.rel = "noopener"; a.click();
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
