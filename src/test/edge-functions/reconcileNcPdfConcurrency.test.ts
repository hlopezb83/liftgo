import { describe, expect, it, vi } from "vitest";
import {
  ORGANIZATION_A,
  ORGANIZATION_B,
  PDF_BYTES,
} from "./ncPdfRecoveryFixture";
import {
  fixture,
  mocks,
  reconcile,
  unchangedFiscalFields,
} from "./ncPdfRecoveryHarness";

describe("NC PDF-only reconciliation: claims, retries and concurrent changes", () => {
  it.each(["error", "zero", "throw"] as const)(
    "never contacts PAC after claim %s",
    async (outcome) => {
      const { behavior, notes, upload, committed } = fixture();
      const before = { ...notes[0] };
      behavior.failure = { stage: "claim", outcome };
      const result = await reconcile();
      expect(result.processed).toBe(1);
      expect(notes[0]).toEqual(before);
      expect(committed).toEqual([]);
      expect(mocks.retrieve).not.toHaveBeenCalled();
      expect(mocks.pdf).not.toHaveBeenCalled();
      expect(upload).not.toHaveBeenCalled();
    },
  );

  it.each(["error", "zero", "throw"] as const)(
    "does not report recovered after final write %s",
    async (outcome) => {
      const { behavior, notes, upload, committed } = fixture();
      behavior.failure = { stage: "final", outcome };
      const before = unchangedFiscalFields(notes[0]);
      const result = await reconcile();
      expect(result.processed).toBe(1);
      expect(result.results[0].status).not.toMatch(/recovered|reconciled/);
      expect(notes[0].cfdi_pdf_url).toBeNull();
      expect(unchangedFiscalFields(notes[0])).toEqual(before);
      expect(upload).toHaveBeenCalledOnce();
      expect(committed).toHaveLength(1);
    },
  );

  it("only one overlapping invocation can claim the same NC", async () => {
    const { notes, committed, upload } = fixture();
    await Promise.all([reconcile(), reconcile()]);
    expect(notes[0].cfdi_pdf_url).toEqual(expect.any(String));
    expect(
      committed.filter((write) => !write.patch?.cfdi_pdf_url),
    ).toHaveLength(1);
    expect(mocks.retrieve).toHaveBeenCalledOnce();
    expect(mocks.pdf).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledOnce();
  });

  it.each([
    ["cancelled business state", { status: "cancelled" }],
    ["cancelled fiscal state", { cfdi_status: "cancelled" }],
    ["requested cancellation", { cancellation_status: "pending" }],
    [
      "other worker PDF",
      { cfdi_pdf_url: `${ORGANIZATION_A}/other-worker.pdf` },
    ],
    ["new claim", { updated_at: "2026-11-08T12:20:00.123456Z" }],
    ["changed UUID", { cfdi_uuid: "77777777-7777-4777-8777-777777777777" }],
    ["changed provider id", { facturapi_invoice_id: "new-pac-id" }],
    ["changed XML path", { cfdi_xml_url: `${ORGANIZATION_A}/new.xml` }],
    ["XML pending", { cfdi_xml_pending: true }],
    ["changed organization", { organization_id: ORGANIZATION_B }],
  ])("does not overwrite %s during download", async (_label, mutation) => {
    const { notes, committed } = fixture();
    mocks.pdf.mockImplementation(async () => {
      Object.assign(notes[0], mutation);
      return PDF_BYTES;
    });
    const result = await reconcile();
    expect(result.results[0].status).not.toMatch(/recovered|reconciled/);
    expect(notes[0]).toMatchObject(mutation);
    if (!("cfdi_pdf_url" in mutation)) expect(notes[0].cfdi_pdf_url).toBeNull();
    expect(committed).toHaveLength(1);
  });

  it("cannot claim a row changed after selection", async () => {
    const { notes, behavior, committed } = fixture();
    behavior.beforeWrite = (query) => {
      if (query.patch && !("cfdi_pdf_url" in query.patch))
        notes[0].status = "cancelled";
    };
    await reconcile();
    expect(notes[0].status).toBe("cancelled");
    expect(notes[0].cfdi_pdf_url).toBeNull();
    expect(committed).toEqual([]);
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it("preserves a manual PDF saved while Storage upload was in flight", async () => {
    const { notes, upload, committed } = fixture();
    const manualPdf = `${ORGANIZATION_A}/manual-recovery.pdf`;
    upload.mockImplementation(async (path) => {
      notes[0].cfdi_pdf_url = manualPdf;
      return { data: { path }, error: null };
    });
    expect((await reconcile()).results[0].status).toBe(
      "nc_pdf_persistence_error",
    );
    expect(notes[0].cfdi_pdf_url).toBe(manualPdf);
    expect(upload.mock.calls[0][0]).not.toBe(manualPdf);
    expect(upload.mock.calls[0][2].upsert).toBe(false);
    expect(committed).toHaveLength(1);
  });

  it("uses a fresh attempt-owned object after an unconfirmed final write", async () => {
    const { behavior, upload, notes } = fixture();
    behavior.failure = { stage: "final", outcome: "zero" };
    await reconcile();
    vi.setSystemTime(new Date("2026-11-08T12:11:00.000Z"));
    behavior.failure = undefined;
    expect((await reconcile()).results[0].status).toBe("nc_pdf_recovered");
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[0][0]).not.toBe(upload.mock.calls[1][0]);
    expect(notes[0].cfdi_pdf_url).toBe(upload.mock.calls[1][0]);
  });

  it("does not re-fetch a recovered PDF on subsequent runs, even after ten minutes", async () => {
    const { notes, upload } = fixture();
    await reconcile();
    const recovered = { ...notes[0] };
    vi.setSystemTime(new Date("2026-11-08T13:00:00.000Z"));
    expect((await reconcile()).processed).toBe(0);
    expect(notes[0]).toEqual(recovered);
    expect(mocks.retrieve).toHaveBeenCalledOnce();
    expect(mocks.pdf).toHaveBeenCalledOnce();
    expect(upload).toHaveBeenCalledOnce();
  });

  it("uses the existing timestamp for a ten-minute retry cooldown without new counters", async () => {
    const { notes, writes } = fixture();
    const before = unchangedFiscalFields(notes[0]);
    mocks.pdf.mockRejectedValue(new Error("Temporary PDF failure"));
    await reconcile();
    vi.setSystemTime(new Date("2026-11-08T12:09:59.999Z"));
    expect((await reconcile()).processed).toBe(0);
    expect(mocks.pdf).toHaveBeenCalledOnce();
    vi.setSystemTime(new Date("2026-11-08T12:10:00.001Z"));
    await reconcile();
    expect(mocks.pdf).toHaveBeenCalledTimes(2);
    expect(unchangedFiscalFields(notes[0])).toEqual(before);
    for (const write of writes)
      expect(Object.keys(write.patch ?? {})).toEqual(["updated_at"]);
  });
});
