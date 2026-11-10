import { describe, expect, it } from "vitest";
import {
  ORGANIZATION_A,
  ORGANIZATION_B,
  pdfPendingNote,
} from "./ncPdfRecoveryFixture";
import {
  fixture,
  mocks,
  handleRequest,
  reconcile,
  unchangedFiscalFields,
  expectGuardedCas,
} from "./ncPdfRecoveryHarness";

describe("NC PDF-only reconciliation: auth, eligibility and isolation", () => {
  it.each([401, 403])(
    "rejects unauthorized work before reads or PAC (%s)",
    async (status) => {
      const { reads, writes, upload } = fixture();
      mocks.auth.mockResolvedValue({
        ok: false,
        status,
        error: "Unauthorized",
      });
      const response = await handleRequest(
        new Request("http://localhost/reconcile", { method: "POST" }),
      );
      expect(response.status).toBe(status);
      expect(reads).toEqual([]);
      expect(writes).toEqual([]);
      expect(mocks.config).not.toHaveBeenCalled();
      expect(mocks.retrieve).not.toHaveBeenCalled();
      expect(upload).not.toHaveBeenCalled();
    },
  );

  it("processes PDF-only NC work even with no invoices, REP or stamping NCs", async () => {
    const { notes, reads, writes, rpc } = fixture();
    const before = { ...notes[0] };
    const result = await reconcile();
    expect(result.processed).toBe(1);
    expect(result.results).toEqual([
      expect.objectContaining({ invoice_id: before.id }),
    ]);
    expect(notes[0].cfdi_pdf_url).toEqual(expect.stringMatching(/\.pdf$/));
    expect(unchangedFiscalFields(notes[0])).toEqual(
      unchangedFiscalFields(before),
    );
    expect(mocks.retrieve).toHaveBeenCalledExactlyOnceWith(
      before.facturapi_invoice_id,
    );
    expect(mocks.pdf).toHaveBeenCalledExactlyOnceWith(
      before.facturapi_invoice_id,
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.folio).not.toHaveBeenCalled();
    expect(result.results[0].status).toBe("nc_pdf_recovered");
    const selection = reads.find(
      (query) =>
        query.table === "credit_notes" &&
        query.filters.some(
          (filter) =>
            filter.column === "cfdi_status" && filter.value === "stamped",
        ),
    );
    expect(selection).toBeDefined();
    expect(selection?.limit).toBe(10);
    expect(selection?.order).toContainEqual({
      column: "updated_at",
      ascending: true,
    });
    expect(selection?.filters).toContainEqual({
      operator: "lt",
      column: "updated_at",
      value: "2026-11-08T11:50:00.000Z",
    });
    expect(writes).toHaveLength(2);
    expectGuardedCas(writes[0], before);
    expect(writes[0].patch).toEqual({ updated_at: expect.any(String) });
    const claimTimestamp = writes[1].filters.find(
      (filter) => filter.column === "updated_at",
    )?.value;
    expect(claimTimestamp).not.toBe(writes[0].patch?.updated_at);
    expectGuardedCas(writes[1], { ...before, updated_at: claimTimestamp });
    expect(
      Object.keys(writes[1].patch ?? {}).filter((key) => key !== "updated_at"),
    ).toEqual(["cfdi_pdf_url"]);
  });

  it("scopes manual recovery to the server-resolved caller organization", async () => {
    const noteA = pdfPendingNote();
    const noteB = pdfPendingNote({
      id: "55555555-5555-4555-8555-555555555555",
      organization_id: ORGANIZATION_B,
    });
    const { reads } = fixture([noteA, noteB]);
    const result = await reconcile({ "x-caller-user-id": "manual-user" });
    expect(result.results.map((row) => row.invoice_id)).toEqual([noteA.id]);
    expect(noteB.cfdi_pdf_url).toBeNull();
    expect(mocks.config).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ organizationId: ORGANIZATION_A }),
    );
    for (const read of reads.filter((query) =>
      ["invoices", "payments", "credit_notes"].includes(query.table),
    )) {
      expect(read.filters).toContainEqual({
        operator: "eq",
        column: "organization_id",
        value: ORGANIZATION_A,
      });
    }
  });

  it.each(["missing", "ambiguous", "inactive", "lookup-error"])(
    "rejects unresolved manual tenant: %s",
    async (kind) => {
      const { tables, behavior, writes } = fixture();
      if (kind === "missing") tables.organization_memberships = [];
      if (kind === "ambiguous")
        tables.organization_memberships.push({
          ...tables.organization_memberships[0],
        });
      if (kind === "inactive") tables.organizations[0].is_active = false;
      if (kind === "lookup-error")
        behavior.readError = (query) =>
          query.table === "organization_memberships";
      const response = await handleRequest(
        new Request("http://localhost/reconcile", {
          method: "POST",
          headers: { "x-caller-user-id": "manual-user" },
        }),
      );
      expect(response.status).toBe(
        kind === "ambiguous" ? 409 : kind === "lookup-error" ? 503 : 403,
      );
      expect(writes).toEqual([]);
      expect(mocks.config).not.toHaveBeenCalled();
      expect(mocks.retrieve).not.toHaveBeenCalled();
    },
  );

  const excluded = [
    ["business state cancelled", { status: "cancelled" }],
    ["fiscal state cancelled", { cfdi_status: "cancelled" }],
    ["pending cancellation", { cancellation_status: "pending" }],
    ["accepted cancellation", { cancellation_status: "accepted" }],
    ["XML pending", { cfdi_xml_pending: true }],
    ["unknown XML state", { cfdi_xml_pending: null }],
    ["missing XML", { cfdi_xml_url: null }],
    ["blank XML", { cfdi_xml_url: "" }],
    ["missing UUID", { cfdi_uuid: null }],
    ["invalid UUID", { cfdi_uuid: "invalid" }],
    ["missing PAC id", { facturapi_invoice_id: null }],
    ["blank PAC id", { facturapi_invoice_id: "" }],
    ["existing PDF", { cfdi_pdf_url: `${ORGANIZATION_A}/existing.pdf` }],
    ["recent row", { updated_at: "2026-11-08T11:59:00.000Z" }],
    ["exact ten-minute boundary", { updated_at: "2026-11-08T11:50:00.000Z" }],
    ["missing timestamp", { updated_at: null }],
    ["invalid timestamp", { updated_at: "invalid" }],
  ] as const;
  it.each(excluded)("does not recover %s", async (_label, overrides) => {
    const note = pdfPendingNote(overrides);
    const before = { ...note };
    const { writes, upload } = fixture([note]);
    await reconcile();
    expect(note).toEqual(before);
    expect(writes).toEqual([]);
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.pdf).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it("selects at most ten oldest eligible NCs and leaves newer ones for later", async () => {
    const notes = Array.from({ length: 12 }, (_, index) =>
      pdfPendingNote({
        id: `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`,
        updated_at: `2026-11-08T11:${String(index).padStart(2, "0")}:00.000Z`,
      }),
    ).reverse();
    fixture(notes);
    const result = await reconcile();
    expect(result.processed).toBe(10);
    expect(result.results.map((row) => row.invoice_id)).toEqual(
      [...notes]
        .reverse()
        .slice(0, 10)
        .map((note) => note.id),
    );
    expect(notes.filter((note) => note.cfdi_pdf_url !== null)).toHaveLength(10);
    expect(mocks.pdf).toHaveBeenCalledTimes(10);
  });

  it.each(["missing", "throws"])(
    "does not borrow credentials if organization config %s",
    async (kind) => {
      const { notes, writes, upload } = fixture();
      if (kind === "throws")
        mocks.config.mockRejectedValue(new Error("Config unavailable"));
      else mocks.config.mockResolvedValue({ apiKey: null, mode: "test" });
      const result = await reconcile();
      expect(result.results).toEqual([
        expect.objectContaining({ status: "org_misconfigured" }),
      ]);
      expect(notes[0].cfdi_pdf_url).toBeNull();
      expect(writes).toEqual([]);
      expect(mocks.createClient).not.toHaveBeenCalled();
      expect(mocks.retrieve).not.toHaveBeenCalled();
      expect(upload).not.toHaveBeenCalled();
    },
  );

  it("reports an orphan without resolving any other tenant's configuration", async () => {
    const { writes, upload } = fixture([
      pdfPendingNote({ organization_id: null }),
    ]);
    const result = await reconcile();
    expect(result.results).toEqual([
      expect.objectContaining({ status: "skipped_without_organization" }),
    ]);
    expect(writes).toEqual([]);
    expect(mocks.config).not.toHaveBeenCalled();
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "reports PDF selection failure without blocking other queues (REP=%s)",
    async (withRep) => {
      const { behavior, tables, writes } = fixture();
      behavior.readError = (query) =>
        query.table === "credit_notes" &&
        query.filters.some(
          (filter) =>
            filter.column === "cfdi_status" && filter.value === "stamped",
        );
      if (withRep) {
        tables.payments.push({
          id: "payment-1",
          organization_id: ORGANIZATION_A,
          invoice_id: "invoice-1",
          rep_cfdi_status: "stamped",
          rep_facturapi_id: "pac-rep-1",
          rep_number: null,
          rep_folio: 12,
        });
        mocks.folio.mockResolvedValue({ ok: true });
      }
      const result = await reconcile();
      expect(result.results.map((row) => row.status)).toEqual(
        withRep
          ? ["nc_pdf_selection_error", "rep_folio_recovered"]
          : ["nc_pdf_selection_error"],
      );
      expect(writes).toEqual([]);
      expect(mocks.retrieve).not.toHaveBeenCalled();
      expect(mocks.pdf).not.toHaveBeenCalled();
      if (withRep)
        expect(mocks.folio).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
          paymentId: "payment-1",
          organizationId: ORGANIZATION_A,
          folio: 12,
        });
    },
  );
});
