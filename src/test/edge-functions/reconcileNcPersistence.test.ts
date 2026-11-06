import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNcPersistenceFixture } from "./ncPersistenceFixture";

const mocks = vi.hoisted(() => ({
  admin: null as unknown,
  lookup: vi.fn(),
  xml: vi.fn(),
  pdf: vi.fn(),
  folio: vi.fn(),
}));
vi.mock("../../../supabase/functions/_shared/supabaseClients.ts", () => ({
  getAdminClient: () => mocks.admin,
}));
vi.mock("../../../supabase/functions/_shared/cronAuth.ts", () => ({
  authenticateCronRequest: async () => ({ ok: true }),
}));
vi.mock("../../../supabase/functions/_shared/cors.ts", () => ({
  handleCors: () => null,
}));
vi.mock("../../../supabase/functions/_shared/http.ts", () => ({
  jsonResponse: (_req: Request, body: unknown, init: ResponseInit) =>
    new Response(JSON.stringify(body), init),
}));
vi.mock(
  "../../../supabase/functions/_shared/facturapi/invoiceRecovery.ts",
  () => ({ lookupPacInvoice: mocks.lookup }),
);
vi.mock("../../../supabase/functions/_shared/repFolio.ts", () => ({
  assignRepFolio: mocks.folio,
  repFolioPendingMessage: String,
}));
vi.mock("../../../supabase/functions/_shared/facturapi/client.ts", () => ({
  getFacturapiConfigForOrganization: async () => ({
    apiKey: "offline-test",
    mode: "test",
  }),
  createFacturapiClient: () => ({
    invoices: { downloadXml: mocks.xml, downloadPdf: mocks.pdf },
  }),
  binaryToText: async (x: unknown) => x,
  binaryToBytes: async (x: unknown) => x,
  retryOnFacturapi5xx: (fn: () => unknown) => fn(),
  describeFacturapiError: (err: Error) => ({ message: err.message }),
}));
// Keep Deno-only imports out of the browser TypeScript graph. Vitest still
// executes the real handler, with every external dependency mocked above.
const handlerPath =
  "../../../supabase/functions/reconcile-stamping-invoices/index.ts";
const { handleRequest } = (await import(handlerPath)) as {
  handleRequest: (req: Request) => Promise<Response>;
};

const fixture = createNcPersistenceFixture.bind(null, mocks);

async function reconcile() {
  const response = await handleRequest(
    new Request("http://localhost/reconcile", { method: "POST" }),
  );
  expect(response.status).toBe(200);
  return (await response.json()).results;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.lookup.mockResolvedValue({
    kind: "hit",
    facturapi_id: "pac-1",
    uuid: "22222222-2222-4222-8222-222222222222",
  });
  mocks.folio.mockResolvedValue({ ok: true });
  mocks.xml.mockResolvedValue("<xml />");
  mocks.pdf.mockResolvedValue(new Uint8Array([1, 2]));
});
describe("NC persistence (actual handler, no network)", () => {
  it.each([false, true])(
    "does not report finalization on error/zero rows (%s)",
    async (noRow) => {
      const { note } = fixture("stamped", noRow, 0, true);
      expect(await reconcile()).toEqual([
        expect.objectContaining({ status: "nc_persistence_error" }),
      ]);
      expect(note.cfdi_status).toBe("stamping");
    },
  );
  it.each([false, true])(
    "stops before download if recovered identifiers fail (%s)",
    async (noRow) => {
      fixture("ids", noRow);
      expect(await reconcile()).toEqual([
        expect.objectContaining({ status: "nc_persistence_error" }),
      ]);
      expect(mocks.xml).not.toHaveBeenCalled();
    },
  );
  it.each([false, true])(
    "finalizes with rotating DB timestamps (existingIds=%s)",
    async (ids) => {
      const { note, writeFilters } = fixture("none", false, 0, ids);
      expect(await reconcile()).toEqual([
        expect.objectContaining({ status: "nc_reconciled" }),
      ]);
      expect(note.cfdi_status).toBe("stamped");
      for (const filters of writeFilters) {
        expect(filters).toMatchObject({
          id: note.id,
          organization_id: note.organization_id,
          cfdi_status: "stamping",
          updated_at: expect.any(String),
        });
      }
      expect(new Set(writeFilters.map((f) => f.updated_at)).size).toBe(
        writeFilters.length,
      );
    },
  );
  it("does not overwrite a terminal state during download", async () => {
    const { note } = fixture("none", false, 0, true);
    mocks.xml.mockImplementation(async () => {
      note.cfdi_status = "cancelled";
      return "<xml />";
    });
    expect(await reconcile()).toEqual([
      expect.objectContaining({ status: "nc_persistence_error" }),
    ]);
    expect(note.cfdi_status).toBe("cancelled");
  });
});

describe("NC recovery transitions", () => {
  const transitions = [
    ["pending", "nc_pac_pending", 2, "stamping"],
    ["failed", "nc_pac_failed_manual_review", 2, "error"],
    ["miss", "nc_reverted_to_error", 4, "error"],
    ["miss", "nc_lookup_deferred", 2, "stamping"],
  ] as const;
  it.each(transitions)(
    "requires confirmed writes for %s (%s)",
    async (kind, status, count, next) => {
      for (const noRow of [false, true]) {
        const { note } = fixture(
          kind === "miss" && count === 2 ? "counter" : "state",
          noRow,
        );
        note.lookup_attempts = count;
        mocks.lookup.mockResolvedValue({ kind, facturapi_id: "pac-1" });
        expect(await reconcile()).toEqual([
          expect.objectContaining({ status: "nc_persistence_error" }),
        ]);
        expect(note.cfdi_status).toBe("stamping");
        expect(note.lookup_attempts).toBe(count);
      }
      const { note } = fixture("none");
      note.lookup_attempts = count;
      expect(await reconcile()).toEqual([expect.objectContaining({ status })]);
      expect(note.cfdi_status).toBe(next);
      expect(note.lookup_attempts).toBe(kind === "miss" ? count + 1 : count);
    },
  );
  it.each([0, 100])(
    "checks XML state persistence while preserving fiscal semantics (attempts=%s)",
    async (attempts) => {
      mocks.xml.mockRejectedValue(new Error("XML unavailable"));
      for (const noRow of [false, true]) {
        const { note } = fixture("xml", noRow, attempts, true);
        expect(await reconcile()).toEqual([
          expect.objectContaining({ status: "nc_persistence_error" }),
        ]);
        expect(note.cfdi_status).toBe("stamping");
        expect(note.stamping_attempts).toBe(attempts);
      }
      const { note } = fixture("none", false, attempts, true);
      expect(await reconcile()).toEqual([
        expect.objectContaining({
          status:
            attempts === 0 ? "nc_xml_pending" : "nc_stamped_xml_pending_manual",
        }),
      ]);
      expect(note.cfdi_status).toBe(attempts === 0 ? "stamping" : "stamped");
      expect(note.stamping_attempts).toBe(attempts + 1);
    },
  );
  it.each(["pending", "failed", "miss", "hit"])(
    "does not overwrite a newer claim after %s lookup",
    async (kind) => {
      const { note } = fixture("none");
      note.lookup_attempts = 4;
      mocks.lookup.mockImplementation(async () => {
        note.updated_at = "2099-01-01T00:00:00.000000Z";
        return { kind, facturapi_id: "pac-1", uuid: "uuid-1" };
      });
      expect(await reconcile()).toEqual([
        expect.objectContaining({ status: "nc_persistence_error" }),
      ]);
      expect(note.updated_at).toBe("2099-01-01T00:00:00.000000Z");
      expect(note.cfdi_status).toBe("stamping");
      expect(note.facturapi_invoice_id).toBeNull();
      expect(mocks.xml).not.toHaveBeenCalled();
    },
  );
  it.each([false, true])(
    "does not contact PAC after failed claim (noRow=%s)",
    async (noRow) => {
      fixture("claim", noRow);
      expect(await reconcile()).toEqual([
        expect.objectContaining({
          status: noRow ? "claimed_by_other_run" : "nc_persistence_error",
        }),
      ]);
      expect(mocks.lookup).not.toHaveBeenCalled();
    },
  );
  it("does not bypass a missing claim timestamp", async () => {
    const { note } = fixture("none");
    note.updated_at = null;
    expect(await reconcile()).toEqual([
      expect.objectContaining({ status: "nc_persistence_error" }),
    ]);
    expect(mocks.lookup).not.toHaveBeenCalled();
  });
  it("reports a thrown write without releasing its claim", async () => {
    const { note } = fixture("throw");
    mocks.lookup.mockResolvedValue({ kind: "pending", facturapi_id: "pac-1" });
    expect(await reconcile()).toEqual([
      expect.objectContaining({ status: "nc_persistence_error" }),
    ]);
    expect(note.cfdi_status).toBe("stamping");
    expect(note.facturapi_invoice_id).toBeNull();
  });
  it("keeps an uncertain lookup pending without consuming a miss", async () => {
    const { note, writes } = fixture("none");
    mocks.lookup.mockResolvedValue({ kind: "lookup_failed" });
    expect(await reconcile()).toEqual([
      expect.objectContaining({ status: "nc_lookup_deferred" }),
    ]);
    expect(note.lookup_attempts).toBe(2);
    expect(writes).toHaveLength(1);
  });
});
