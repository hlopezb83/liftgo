import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";

export type CfdiFormat = "pdf" | "xml" | "acuse_pdf" | "acuse_xml";

export type CfdiTarget =
  | { invoice_id: string }
  | { credit_note_id: string }
  | { payment_id: string };

const MIME_BY_FORMAT: Record<CfdiFormat, string> = {
  pdf: "application/pdf",
  xml: "application/xml",
  acuse_pdf: "application/pdf",
  acuse_xml: "application/xml",
};


/**
 * Invokes the `download-cfdi` edge function and returns the resulting Blob.
 * Throws on transport or function errors; callers handle UI feedback.
 */
export async function fetchCfdiBlob(target: CfdiTarget, format: CfdiFormat): Promise<Blob> {
  const data = await invokeEdgeFunction<Blob | BlobPart>("download-cfdi", {
    body: { ...target, format },
  });
  if (data instanceof Blob) return data;
  return new Blob([data as BlobPart], { type: MIME_BY_FORMAT[format] });
}

/** Triggers an in-browser download for a Blob using a transient anchor. */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Convenience: fetch the CFDI blob and immediately trigger the download. */
export async function downloadCfdiBlob(
  target: CfdiTarget,
  format: CfdiFormat,
  filename: string,
): Promise<void> {
  const blob = await fetchCfdiBlob(target, format);
  triggerBlobDownload(blob, filename);
}
