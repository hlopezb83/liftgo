import { describe, expect, it, vi } from "vitest";
import {
  ORGANIZATION_A,
  PDF_BYTES,
  PDF_NOW,
  type Row,
} from "./ncPdfRecoveryFixture";
import {
  fixture,
  mocks,
  pacInvoice,
  reconcile,
  unchangedFiscalFields,
} from "./ncPdfRecoveryHarness";

describe("NC PDF-only reconciliation: provider and binary safety", () => {
  it.each([
    ["provider id", { id: "other-id" }],
    ["CFDI UUID", { uuid: "66666666-6666-4666-8666-666666666666" }],
    ["invoice type", { type: "I" }],
    ["payment type", { type: "P" }],
    ["environment", { livemode: true }],
    ["missing environment", { livemode: undefined }],
    ["missing UUID", { uuid: undefined }],
    ["missing type", { type: undefined }],
    ["cancelled remote state", { status: "canceled" }],
    ["pending remote state", { status: "pending" }],
    ["missing remote state", { status: undefined }],
    [
      "foreign external id",
      { external_id: "55555555-5555-4555-8555-555555555555" },
    ],
  ])("does not download on %s mismatch", async (_label, overrides) => {
    const { notes, upload, committed } = fixture();
    mocks.retrieve.mockResolvedValue(pacInvoice(overrides as Row));
    const result = await reconcile();
    expect(result.processed).toBe(1);
    expect(notes[0].cfdi_pdf_url).toBeNull();
    expect(committed).toHaveLength(1);
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("accepts live PDF retrieval only when provider livemode matches configured live mode", async () => {
    const { notes } = fixture();
    mocks.config.mockResolvedValue({ apiKey: "offline-live", mode: "live" });
    mocks.retrieve.mockResolvedValue(pacInvoice({ livemode: true }));
    await reconcile();
    expect(notes[0].cfdi_pdf_url).toEqual(expect.any(String));
    expect(mocks.createClient).toHaveBeenCalledWith("offline-live");
  });

  it("accepts case-insensitive matching UUID and matching optional external id", async () => {
    const { notes } = fixture();
    notes[0].cfdi_uuid = "abcdefab-abcd-4abc-8abc-abcdefabcdef";
    mocks.retrieve.mockResolvedValue(
      pacInvoice({
        uuid: String(notes[0].cfdi_uuid).toUpperCase(),
        external_id: notes[0].id,
      }),
    );
    expect((await reconcile()).results[0].status).toBe("nc_pdf_recovered");
  });

  it.each(["retrieve", "download"])(
    "bounds a stalled %s call to eight seconds and ignores a late result",
    async (stage) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(PDF_NOW));
      const { notes, upload, committed } = fixture();
      let release: (value: unknown) => void = () => {};
      const stalled = new Promise((resolve) => {
        release = resolve;
      });
      (stage === "retrieve" ? mocks.retrieve : mocks.pdf).mockReturnValue(
        stalled,
      );
      const pending = reconcile();
      await vi.advanceTimersByTimeAsync(8_001);
      const result = await pending;
      expect(result.results[0].status).toBe("nc_pdf_recovery_pending");
      release(stage === "retrieve" ? pacInvoice() : PDF_BYTES);
      await vi.advanceTimersByTimeAsync(1);
      expect(notes[0].cfdi_pdf_url).toBeNull();
      expect(committed).toHaveLength(1);
      expect(upload).not.toHaveBeenCalled();
    },
  );

  it.each([
    "retrieve-error",
    "retrieve-timeout",
    "download-error",
    "download-timeout",
  ])(
    "keeps a claimed NC pending after %s without fiscal mutation",
    async (kind) => {
      const { notes, upload, committed } = fixture();
      const before = unchangedFiscalFields(notes[0]);
      const error = new Error("PAC unavailable");
      if (kind.endsWith("timeout")) error.name = "TimeoutError";
      (kind.startsWith("retrieve")
        ? mocks.retrieve
        : mocks.pdf
      ).mockRejectedValue(error);
      await reconcile();
      expect(notes[0].cfdi_pdf_url).toBeNull();
      expect(unchangedFiscalFields(notes[0])).toEqual(before);
      expect(committed).toHaveLength(1);
      expect(upload).not.toHaveBeenCalled();
      await reconcile();
      expect(mocks.retrieve).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ["empty", () => new Uint8Array()],
    ["HTML", () => new TextEncoder().encode("<html>provider error</html>")],
    ["wrong magic", () => new TextEncoder().encode("%PDX-1.7\n")],
    ["embedded PDF magic", () => new TextEncoder().encode("error %PDF-1.7\n")],
    [
      "over 10 MiB",
      () => {
        const bytes = new Uint8Array(10 * 1024 * 1024 + 1);
        bytes.set(PDF_BYTES);
        return bytes;
      },
    ],
  ] as const)("rejects %s bytes before Storage", async (_label, makeBytes) => {
    const { notes, upload } = fixture();
    mocks.pdf.mockResolvedValue(makeBytes());
    await reconcile();
    expect(notes[0].cfdi_pdf_url).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  it.each([PDF_BYTES.byteLength, 10 * 1024 * 1024])(
    "uploads valid %s-byte PDF under the row tenant",
    async (size) => {
      const { notes, upload, storageFrom } = fixture();
      const bytes = new Uint8Array(size);
      bytes.set(PDF_BYTES);
      mocks.pdf.mockResolvedValue(bytes);
      await reconcile();
      expect(storageFrom).toHaveBeenCalledWith("cfdi-files");
      expect(upload).toHaveBeenCalledOnce();
      const [path, stored, options] = upload.mock.calls[0];
      expect(path).toMatch(
        new RegExp(
          `^${ORGANIZATION_A}/credit-notes/${notes[0].id}/${notes[0].cfdi_uuid}-recovery-[a-f0-9-]{36}\\.pdf$`,
        ),
      );
      expect(stored.byteLength).toBe(size);
      expect(stored.subarray(0, PDF_BYTES.byteLength)).toEqual(PDF_BYTES);
      expect(options.contentType).toBe("application/pdf");
      expect(options.upsert).toBe(false);
      expect(notes[0].cfdi_pdf_url).toBe(path);
    },
  );

  const supportedBodies = [
    ["ArrayBuffer", () => PDF_BYTES.slice().buffer],
    ["Blob", () => new Blob([PDF_BYTES.slice()])],
    ["Response", () => new Response(PDF_BYTES.slice())],
    ["SDK data wrapper", () => ({ data: PDF_BYTES.slice() })],
    [
      "stream",
      () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue(PDF_BYTES.slice(0, 3));
            controller.enqueue(PDF_BYTES.slice(3));
            controller.close();
          },
        }),
    ],
  ] as const;
  it.each(supportedBodies)(
    "accepts bounded binary %s bodies",
    async (_kind, makeBody) => {
      const { upload } = fixture();
      mocks.pdf.mockResolvedValue(makeBody());
      expect((await reconcile()).results[0].status).toBe("nc_pdf_recovered");
      expect(upload.mock.calls[0][1]).toEqual(PDF_BYTES);
    },
  );

  it.each([
    ["text", (): string => "%PDF-1.7 text is not a binary download"],
    ["HTTP error", () => new Response(PDF_BYTES.slice(), { status: 503 })],
    [
      "invalid stream chunks",
      () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue("%PDF-1.7");
            controller.close();
          },
        }),
    ],
    [
      "oversized stream",
      () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue(PDF_BYTES.slice());
            controller.enqueue(new Uint8Array(10 * 1024 * 1024));
            controller.close();
          },
        }),
    ],
  ] as const)("rejects %s bodies", async (_kind, makeBody) => {
    const { notes, upload } = fixture();
    mocks.pdf.mockResolvedValue(makeBody());
    expect((await reconcile()).results[0].status).toBe(
      "nc_pdf_recovery_pending",
    );
    expect(notes[0].cfdi_pdf_url).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  it("cancels a stalled PDF stream on timeout without uploading partial bytes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(PDF_NOW));
    const { notes, upload } = fixture();
    const cancel = vi.fn();
    mocks.pdf.mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.enqueue(PDF_BYTES.slice());
        },
        cancel,
      }),
    );
    const pending = reconcile();
    await vi.advanceTimersByTimeAsync(8_001);
    expect((await pending).results[0].status).toBe("nc_pdf_recovery_pending");
    expect(cancel).toHaveBeenCalledOnce();
    expect(notes[0].cfdi_pdf_url).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  it.each(["error", "throw"])(
    "does not persist PDF when upload returns %s",
    async (kind) => {
      const { notes, upload, committed } = fixture();
      if (kind === "throw")
        upload.mockRejectedValue(new Error("Storage unavailable"));
      else
        upload.mockResolvedValue({
          data: { path: "unused" },
          error: { message: "Storage unavailable" },
        });
      await reconcile();
      expect(notes[0].cfdi_pdf_url).toBeNull();
      expect(committed).toHaveLength(1);
    },
  );
});
