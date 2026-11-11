import type { ExportReply } from "@/lib/exportInWorker";
import { buildAccountantWorkbookBytes } from "./workbookBytes";
import type { ExportSheet } from "./model";

self.onmessage = async ({ data }: MessageEvent<ExportSheet[]>) => {
  try {
    const value = await buildAccountantWorkbookBytes(data);
    const reply: ExportReply<Uint8Array> = { value };
    const transfer = value.buffer instanceof ArrayBuffer ? [value.buffer] : [];
    self.postMessage(reply, { transfer });
  } catch (error) {
    const reply: ExportReply<Uint8Array> = { error: error instanceof Error ? error.message : "No se pudo generar el XLSX." };
    self.postMessage(reply);
  }
};
