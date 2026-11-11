import type { ExportReply } from "@/lib/exportInWorker";
import { renderPdfBlob, type PdfExport } from "./renderPdfBlob";

self.onmessage = async ({ data }: MessageEvent<PdfExport>) => {
  let reply: ExportReply<Blob>;
  try {
    reply = { value: await renderPdfBlob(data) };
  } catch (error) {
    reply = { error: error instanceof Error ? error.message : "No se pudo generar el PDF." };
  }
  self.postMessage(reply);
};
