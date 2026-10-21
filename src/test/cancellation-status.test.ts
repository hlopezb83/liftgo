import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildSupabaseMock } from "../../supabase/functions/_shared/test/supabaseClientMock";
const h = vi.hoisted(() => ({
  status: "pending",
  supabase: null as any,
  pac: vi.fn(),
  enqueue: vi.fn(),
}));
vi.mock("../../supabase/functions/_shared/cors.ts", () => ({
  handleCors: () => null,
  getCorsHeaders: () => ({}),
}));
vi.mock("../../supabase/functions/_shared/authWithDeps.ts", () => ({
  authenticateWithDeps: async () => ({
    ok: true,
    userId: "audit",
    isServiceRole: false,
    supabase: h.supabase,
  }),
}));
vi.mock("../../supabase/functions/_shared/orgContext.ts", () => ({
  resolveDocumentOrganization: async () => ({
    ok: true,
    organizationId: "audit-org",
  }),
}));
vi.mock("../../supabase/functions/_shared/facturapi/retryContext.ts", () => ({
  loadRetryAwareFacturapiConfig: async () => ({
    ok: true,
    apiKey: "mock-only",
    mode: "test",
  }),
}));
vi.mock("../../supabase/functions/_shared/facturapi/client.ts", () => ({
  createFacturapiClient: () => ({}),
  cancelInvoiceWithSignal: async () => {
    h.pac();
    return { cancellation_status: h.status };
  },
  describeFacturapiError: () => ({}),
}));
vi.mock("../../supabase/functions/_shared/facturapi/withTimeout.ts", () => ({
  sdkCallWithTimeout: async (fn: any) => fn(),
  isFacturapiTimeout: () => false,
}));
vi.mock("../../supabase/functions/_shared/cfdiRetryQueue.ts", () => ({
  enqueueCfdiRetry: h.enqueue,
  isTransientFacturapiError: () => false,
}));
// Keep Deno-only dependencies out of the browser TypeScript graph. Vitest
// executes the real handler with external boundaries mocked above.
const handlerPath = "../../supabase/functions/cancel-cfdi/handler.ts";
const { handleCancelCfdi } = (await import(handlerPath)) as {
  handleCancelCfdi: (req: Request, deps: unknown) => Promise<Response>;
};
const id = "11111111-1111-4111-8111-111111111111";
function request() {
  return new Request("http://localhost/cancel-cfdi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoice_id: id, motive: "02" }),
  });
}
const deps: any = {
  createCallerClient: () => h.supabase,
  createServiceClient: () => h.supabase,
  fetchImpl: () => {
    throw Error("NO NETWORK");
  },
  env: () => undefined,
};
describe("cancellation status messages with mocked boundaries, no network", () => {
  beforeEach(() => {
    h.pac.mockClear();
    h.enqueue.mockClear();
  });
  for (const scenario of ["payments", "rpc-error", "already-pending"])
    it(`blocks ${scenario} before provider`, async () => {
      const mock = buildSupabaseMock({
        selects: {
          invoices: {
            data: {
              cfdi_status: "stamped",
              facturapi_invoice_id: "fapi_mock",
              organization_id: "audit-org",
            },
            error: null,
          },
        },
        updatesSeq: { invoices: [{ data: null, error: null }] },
        rpcs: {
          assert_invoice_cancellable: {
            data: scenario === "payments" ? "Hay pagos aplicados" : null,
            error: scenario === "rpc-error" ? { message: "unavailable" } : null,
          },
        },
      });
      h.supabase = mock.client;
      const res = await handleCancelCfdi(request(), deps);
      expect(res.status).toBe(scenario === "rpc-error" ? 500 : 409);
      expect(h.pac).not.toHaveBeenCalled();
      expect(mock.updates.length).toBe(scenario === "already-pending" ? 1 : 0);
    });
  for (const status of [
    "pending",
    "rejected",
    "expired",
    "accepted",
    "unrecognized",
  ])
    it(`preserves provider state ${status}, verifies user warning`, async () => {
      h.status = status;
      const mock = buildSupabaseMock({
        selects: {
          invoices: {
            data: {
              cfdi_status: "stamped",
              facturapi_invoice_id: "fapi_mock",
              organization_id: "audit-org",
            },
            error: null,
          },
        },
        updatesSeq: { invoices: [{ data: { id }, error: null }] },
        updates: { invoices: { data: { id }, error: null } },
        rpcs: { assert_invoice_cancellable: { data: null, error: null } },
      } as any);
      h.supabase = mock.client;
      const res = await handleCancelCfdi(request(), deps);
      const body = await res.json();
      if (status === "unrecognized") {
        expect(res.status).toBe(502);
        expect(body.code).toBe("PAC_UNCERTAIN");
        expect(body.accepted).toBeUndefined();
        expect(body.success).toBeUndefined();
        expect(h.pac).toHaveBeenCalledTimes(1);
        expect(h.enqueue).not.toHaveBeenCalled();
        // Only the initial claim persists: no release and no false finalization.
        expect(mock.updates).toHaveLength(1);
        expect(mock.updates[0].patch.cancellation_status).toBe("pending");
        expect(mock.updates[0].patch.cfdi_status).toBeUndefined();
        return;
      }
      expect(res.status).toBe(200);
      expect(body.cancellation_status).toBe(status);
      expect(h.pac).toHaveBeenCalledTimes(1);
      if (status === "accepted") {
        expect(body.accepted).toBe(true);
        expect(body.warning).toBeUndefined();
      } else {
        expect(body.accepted).toBe(false);
        if (status === "pending") expect(body.warning).toContain("72 horas");
        else {
          expect(body.warning).toContain(
            status === "rejected" ? "rechazada" : "venció",
          );
          expect(body.warning).toContain("vigente");
          expect(body.warning).not.toContain("pendiente");
          expect(body.warning).not.toContain("72 horas");
        }
      }
      const last = mock.updates.at(-1)?.patch;
      expect(last?.cancellation_status).toBe(status);
      expect(last?.cfdi_status).toBe(
        status === "accepted" ? "cancelled" : undefined,
      );
    });
});
