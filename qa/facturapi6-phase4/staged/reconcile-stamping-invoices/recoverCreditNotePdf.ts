import type { SupabaseLike } from "../_shared/types.ts";
import { isUUID } from "../_shared/validate.ts";
import { organizationStoragePath } from "../_shared/storagePath.ts";
import { sdkCallWithTimeout } from "../_shared/facturapi/withTimeout.ts";
import {
  downloadInvoicePdfWithSignal,
  retrieveInvoiceWithSignal,
} from "../_shared/facturapi/client.ts";

const CALL_TIMEOUT_MS = 8_000;
const MAX_PDF_BYTES = 10 * 1024 * 1024;

// Facturapi 6 client; calls go through the shared signal-aware helpers.
type PdfClient = Parameters<typeof retrieveInvoiceWithSignal>[0];
type Result = { invoice_id: string; status: string };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Only bounded, binary SDK responses are accepted; never archive an error page. */
async function pdfBytes(
  value: unknown,
  signal: AbortSignal,
): Promise<Uint8Array> {
  let bytes: Uint8Array;
  if (signal.aborted) throw new Error("PDF recovery timed out");
  if (value instanceof Uint8Array) bytes = value;
  else if (value instanceof ArrayBuffer) bytes = new Uint8Array(value);
  else if (value instanceof Blob) {
    if (value.size > MAX_PDF_BYTES) throw new Error("PDF exceeds size limit");
    return await pdfBytes(value.stream(), signal);
  } else if (value instanceof Response) {
    if (!value.ok || !value.body) throw new Error("PDF response failed");
    return await pdfBytes(value.body, signal);
  } else if (value instanceof ReadableStream) {
    const reader = value.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    const cancel = () => {
      void reader.cancel().catch(() => {});
    };
    signal.addEventListener("abort", cancel, { once: true });
    try {
      while (true) {
        if (signal.aborted) throw new Error("PDF recovery timed out");
        const part = await reader.read();
        if (part.done) break;
        if (!(part.value instanceof Uint8Array)) {
          throw new Error("Invalid PDF stream");
        }
        size += part.value.byteLength;
        if (size > MAX_PDF_BYTES) throw new Error("PDF exceeds size limit");
        chunks.push(part.value);
      }
      bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
    } finally {
      signal.removeEventListener("abort", cancel);
      void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  } else if (
    value &&
    typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] ===
      "function"
  ) {
    // Node Readable-like iterables (kept for SDK/runtime variants).
    // Bound accumulation and close the iterator on oversize/error/timeout.
    const iterator = (value as AsyncIterable<unknown>)[Symbol.asyncIterator]();
    const chunks: Uint8Array[] = [];
    let size = 0;
    const close = () => {
      const destroy = (value as { destroy?: () => void }).destroy;
      if (typeof destroy === "function") destroy.call(value);
      void iterator.return?.().catch(() => {});
    };
    signal.addEventListener("abort", close, { once: true });
    try {
      while (true) {
        if (signal.aborted) throw new Error("PDF recovery timed out");
        const part = await iterator.next();
        if (part.done) break;
        if (!(part.value instanceof Uint8Array)) {
          throw new Error("Invalid PDF stream");
        }
        size += part.value.byteLength;
        if (size > MAX_PDF_BYTES) throw new Error("PDF exceeds size limit");
        chunks.push(part.value);
      }
      bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
    } finally {
      signal.removeEventListener("abort", close);
      close();
    }
  } else {
    const wrapper = record(value);
    // SDK/axios response wrappers. Do not accept arbitrary text or HTML.
    if (wrapper?.data != null && wrapper.data !== value) {
      return await pdfBytes(wrapper.data, signal);
    }
    throw new Error("Unsupported PDF response");
  }
  if (signal.aborted) throw new Error("PDF recovery timed out");
  if (
    bytes.byteLength < 5 || bytes.byteLength > MAX_PDF_BYTES ||
    String.fromCharCode(...bytes.subarray(0, 5)) !== "%PDF-"
  ) {
    throw new Error("Invalid PDF response");
  }
  return bytes;
}

/**
 * Repair only the file reference of an already stamped NC. This processor has
 * no issuance, lookup-by-external-id, cancellation or fiscal-transition API.
 * Each run claims at most the bounded selection, delaying another try by 10min.
 * No new retry counter: stamping/lookup counters and diagnostics are untouched.
 */
export async function recoverCreditNotePdf(
  admin: Pick<SupabaseLike, "from" | "storage">,
  client: PdfClient,
  nc: Record<string, unknown>,
  organizationId: string,
  mode: "test" | "live",
  outOfBudget: () => boolean,
): Promise<Result> {
  const id = typeof nc.id === "string" ? nc.id : "unknown";
  const result = (status: string): Result => ({ invoice_id: id, status });
  const uuid = nc.cfdi_uuid;
  const pacId = nc.facturapi_invoice_id;
  let timestamp = nc.updated_at;
  if (
    !isUUID(id) || !isUUID(organizationId) || !isUUID(uuid) ||
    nc.organization_id !== organizationId || nc.cfdi_status !== "stamped" ||
    nc.status !== "stamped" || nc.cancellation_status !== "none" ||
    nc.cfdi_xml_pending !== false ||
    typeof nc.cfdi_xml_url !== "string" || !nc.cfdi_xml_url.trim() ||
    nc.cfdi_pdf_url !== null || typeof pacId !== "string" ||
    !/^[a-zA-Z0-9_-]+$/.test(pacId) || typeof timestamp !== "string" ||
    !Number.isFinite(Date.parse(timestamp))
  ) {
    return result("nc_pdf_recovery_ineligible");
  }
  // Every write retains the complete eligibility and identity snapshot. A
  // cancellation, newer claim, changed source, or manual PDF wins over us.
  const persist = async (patch: Record<string, unknown>) => {
    const response = await admin.from("credit_notes").update(patch)
      .eq("id", id).eq("organization_id", organizationId)
      .eq("cfdi_status", "stamped").eq("status", "stamped")
      .eq("cancellation_status", "none")
      .eq("cfdi_uuid", uuid).eq("facturapi_invoice_id", pacId)
      .eq("cfdi_xml_url", nc.cfdi_xml_url).eq("cfdi_xml_pending", false)
      .eq("updated_at", timestamp).is("cfdi_pdf_url", null)
      .select("id, updated_at").maybeSingle();
    const row = record(response.data);
    if (response.error) return "error";
    if (!row) return "conflict";
    if (row.id !== id || typeof row.updated_at !== "string") return "error";
    timestamp = row.updated_at;
    return "ok";
  };
  try {
    const claim = await persist({ updated_at: new Date().toISOString() });
    if (claim !== "ok") {
      return result(
        claim === "conflict"
          ? "claimed_by_other_run"
          : "nc_pdf_persistence_error",
      );
    }
    if (outOfBudget()) return result("nc_pdf_deferred");
    // NC has no historical environment column. Do not infer it from its parent
    // invoice or try another key. Require the exact provider document and mode.
    const remote = record(
      await sdkCallWithTimeout(
        (signal) => retrieveInvoiceWithSignal(client, pacId, { signal }),
        CALL_TIMEOUT_MS,
      ),
    );
    if (
      !remote || remote.id !== pacId || typeof remote.uuid !== "string" ||
      remote.uuid.toLowerCase() !== (uuid as string).toLowerCase() ||
      remote.type !== "E" || remote.livemode !== (mode === "live") ||
      (remote.external_id != null && remote.external_id !== id) ||
      remote.status !== "valid"
    ) {
      return result("nc_pdf_identity_mismatch");
    }
    if (outOfBudget()) return result("nc_pdf_deferred");
    const bytes = await sdkCallWithTimeout(
      async (signal) => {
        // The SDK Node stream does not cancel its underlying web reader when
        // destroyed. Abort its transport after success or any validation error,
        // not only when the eight-second timer fires.
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
        try {
          const binary = await downloadInvoicePdfWithSignal(client, pacId, {
            signal: controller.signal,
          });
          return await pdfBytes(binary, controller.signal);
        } finally {
          abort();
          signal.removeEventListener("abort", abort);
        }
      },
      CALL_TIMEOUT_MS,
    );
    if (outOfBudget()) {
      return result("nc_pdf_deferred");
    }
    // Attempt-owned object avoids overwriting a PDF a concurrent user recovered.
    // A failed/uncertain final CAS may leave this bounded object unreferenced;
    // never delete it because the outcome may be uncertain.
    const path = organizationStoragePath(
      organizationId,
      `credit-notes/${id}/${uuid}-recovery-${crypto.randomUUID()}.pdf`,
    );
    const upload = await admin.storage.from("cfdi-files")
      .upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (upload.error) {
      return result("nc_pdf_recovery_pending");
    }
    const saved = await persist({ cfdi_pdf_url: path });
    return result(
      saved === "ok" ? "nc_pdf_recovered" : "nc_pdf_persistence_error",
    );
  } catch {
    // No false success, fiscal-state changes or release of an uncertain claim.
    return result("nc_pdf_recovery_pending");
  }
}
