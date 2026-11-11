import { exportInWorker } from "@/lib/exportInWorker";
import type { PdfExport } from "./renderPdfBlob";

/**
 * Guarda un `Blob` como archivo usando `<a download>` + `URL.createObjectURL`.
 * Reemplaza a `file-saver`, que era un shim para IE/Edge Legacy (obsoleto en
 * 2026). Todas las plataformas modernas soportan este flujo nativo.
 */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.click();
  // B-5 (mismo patrón que exportCsv): revocar en el mismo tick del click
  // cancela la descarga en Firefox; diferir 1s da tiempo a que el navegador
  // consuma el blob.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function renderAndSave(
  input: PdfExport,
  filename: string,
  shouldSave?: () => boolean,
): Promise<void> {
  const workerBlob = await exportInWorker<PdfExport, Blob>(
    () => new Worker(new URL("./renderPdf.worker.ts", import.meta.url), { type: "module" }),
    input,
  );
  const blob = workerBlob ?? await (await import("./renderPdfBlob")).renderPdfBlob(input);
  if (shouldSave && !shouldSave()) throw new Error("El reporte cambió. Vuelve a exportar.");
  saveBlob(blob, filename);
}
