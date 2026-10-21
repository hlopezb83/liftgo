import { cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import type { Tables } from "@/integrations/supabase/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePaymentHistoryColumns } from "../usePaymentHistoryColumns";
import { InvoicePaymentSummary } from "../../../components/invoice-detail/InvoicePaymentSummary";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { buildSupabaseMock } from "../../../../../../supabase/functions/_shared/test/supabaseClientMock";
import { FacturapiTimeoutError } from "../../../../../../supabase/functions/_shared/facturapi/withTimeout";

const mocks = vi.hoisted(() => ({
  canWrite: true, isPending: false, mutate: vi.fn(), config: vi.fn(), pacBoundary: vi.fn(), blocked: new Set<string>(),
}));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => mocks.canWrite }));
vi.mock("@/features/bank-reconciliation", () => ({ ReconciliationBadge: () => null }));
vi.mock("../cfdi/usePaymentComplement", () => ({
  useStampPaymentComplement: () => ({ mutate: mocks.mutate, isPending: mocks.isPending, retryBlockedPaymentIds: mocks.blocked }),
  useCancelPaymentComplement: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../cfdi/useRefreshCancellationStatus", () => ({
  useRefreshRepCancellationStatus: () => ({ mutate: vi.fn(), isPending: false }),
}));
// Runtime adapters only. Authorization, organization checks, claim handling,
// tax/payload composition, timeouts and response classification remain real.
vi.mock("../../../../../../supabase/functions/_shared/cors.ts", () => ({
  handleCors: () => null, getCorsHeaders: () => ({}),
}));
vi.mock("../../../../../../supabase/functions/_shared/facturapi/client.ts", () => ({
  binaryToBytes: vi.fn(), binaryToText: vi.fn(), createFacturapiClient: () => ({}),
  createInvoiceWithSignal: (...args: unknown[]) => mocks.pacBoundary(...args),
  loadFacturapiConfigOutcome: (...args: unknown[]) => mocks.config(...args),
  describeFacturapiError: (error: Error & { status?: number; code?: string }) => ({
    message: error.message, detail: error.message, status: error.status ?? 502, code: error.code ?? null,
  }),
}));

type Payment = Tables<"payments">;
const payment = (overrides: Omit<Partial<Payment>, "rep_cfdi_status"> & { rep_cfdi_status?: string | null } = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  amount: 116, currency: "MXN", payment_date: "2026-10-19", payment_method: "transfer",
  rep_cfdi_status: "pending", rep_facturapi_id: null, rep_cfdi_uuid: null,
  rep_cancellation_status: null,
  ...overrides,
}) as Payment;

function renderRep(p: Payment, { ppdStamped = true, allowRepMutations = true } = {}) {
  const { result } = renderHook(() => usePaymentHistoryColumns(ppdStamped, allowRepMutations));
  const column = result.current.columns.find((c) => c.id === "rep_status");
  if (column && typeof column.cell === "function") {
    const Cell = column.cell;
    render(<Cell {...({ row: { original: p } } as Parameters<typeof Cell>[0])} />);
  }
}

beforeEach(() => {
  vi.clearAllMocks(); mocks.canWrite = true; mocks.isPending = false;
  mocks.blocked.clear();
  mocks.config.mockResolvedValue({ ok: true, apiKey: "synthetic-offline-key" });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function runHandler({ role = "admin", claim = "claimed", paymentOverrides = {} as Partial<Payment> } = {}) {
  // A variable import keeps Deno-only runtime types out of the browser's tsc
  // graph; Vite still loads the actual handler, not a copy of its logic.
  const handlerPath = "../../../../../../supabase/functions/stamp-payment-complement/handler.ts";
  const { handleStampPaymentComplement } = await import(handlerPath);
  const org = "44444444-4444-4444-8444-444444444444";
  const invoiceId = "33333333-3333-4333-8333-333333333333";
  const caller = buildSupabaseMock({ claims: { sub: "22222222-2222-4222-8222-222222222222" } });
  const p = payment({
    organization_id: org, invoice_id: invoiceId, amount: 116,
    currency: "MXN", payment_form_sat: "03", payment_date: "2026-10-19",
    ...paymentOverrides,
  });
  const activeOrganizationLookup = vi.fn((filters: Array<{ col: string; val: unknown }>) => {
    expect(filters).toContainEqual({ col: "id", val: org });
    return { data: [{ id: org, is_active: true }], error: null };
  });
  const service = buildSupabaseMock({
    selectsByFilter: { organizations: activeOrganizationLookup },
    selects: {
      profiles: { data: { is_active: true }, error: null },
      user_roles: { data: ["admin", "administrativo"].includes(role) ? { role } : null, error: null },
      organization_memberships: { data: [{ organization_id: org, member_type: "internal" }], error: null },
      payments: { data: p, error: null },
      invoices: { data: {
        id: invoiceId, organization_id: org, total: 116, metodo_pago: "PPD",
        cfdi_status: "stamped", cfdi_uuid: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
        moneda: "MXN", tipo_cambio: 1, tax_rate: 16, receptor_rfc: "XAXX010101000",
        line_items: [{ description: "Synthetic service", quantity: 1, unit_price: 100, total: 100 }],
      }, error: null },
    },
    rpcs: {
      claim_payment_rep_stamping: { data: claim, error: null },
      prepare_payment_complement: { data: { installment_number: 1, prior_balance: 116, amount_in_invoice_currency: 116 }, error: null },
    },
  });
  const response = await handleStampPaymentComplement(new Request("http://localhost/offline-rep", {
    method: "POST", headers: { Authorization: "Bearer synthetic-offline-token", "Content-Type": "application/json" },
    body: JSON.stringify({ payment_id: p.id }),
  }), {
    createCallerClient: () => caller.client, createServiceClient: () => service.client,
    env: () => undefined,
    fetchImpl: async () => { throw new Error("Unexpected network attempt"); },
  });
  if (["admin", "administrativo"].includes(role)) {
    expect(activeOrganizationLookup).toHaveBeenCalledExactlyOnceWith([{ col: "id", val: org }]);
  }
  // The RPC is a DI double, not a database/RLS test. Its claimed result models
  // the real RPC's atomic transition to stamping; apply actual handler writes.
  const persisted = service.updates.reduce((row, update) => update.table === "payments"
    ? { ...row, ...update.patch } : row, { ...p, rep_cfdi_status: "stamping" });
  return { response, persisted: persisted as Payment, service };
}

describe("REP recovery action", () => {
  it("offers an explicit retry after a pre-PAC failure leaves pending without provider identifiers", () => {
    renderRep(payment({ rep_error_message: "Falta configuración fiscal" }));
    fireEvent.click(screen.getByRole("button", { name: "Timbrar REP" }));
    expect(mocks.mutate).toHaveBeenCalledExactlyOnceWith("11111111-1111-4111-8111-111111111111");
  });

  it.each(["none", "error", null])("preserves existing unissued state %s", (status) => {
    renderRep(payment({ rep_cfdi_status: status }));
    expect(screen.getByRole("button", { name: "Timbrar REP" })).toBeEnabled();
  });

  it.each(["none", "pending", "error"])("blocks %s when a PAC id exists without a UUID", (status) => {
    renderRep(payment({ rep_cfdi_status: status, rep_facturapi_id: "synthetic-pac-id" }));
    expect(screen.queryByRole("button", { name: "Timbrar REP" })).not.toBeInTheDocument();
  });

  it.each(["none", "pending", "error"])("blocks %s with an existing UUID", (status) => {
    renderRep(payment({ rep_cfdi_status: status, rep_cfdi_uuid: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa" }));
    expect(screen.queryByRole("button", { name: "Timbrar REP" })).not.toBeInTheDocument();
  });

  it.each(["stamping", "stamped", "cancelled", "unexpected"])("does not expose uncertain or terminal state %s as retryable", (status) => {
    renderRep(payment({ rep_cfdi_status: status }));
    expect(screen.queryByRole("button", { name: "Timbrar REP" })).not.toBeInTheDocument();
  });

  it("retains the in-flight guard for pending recovery", () => {
    mocks.isPending = true;
    renderRep(payment());
    const button = screen.getByRole("button", { name: "Timbrar REP" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("does not expose pending recovery to read-only users", () => {
    mocks.canWrite = false;
    renderRep(payment());
    expect(screen.queryByRole("button", { name: "Timbrar REP" })).not.toBeInTheDocument();
  });

  it("retains the parent invoice cancellation guard", () => {
    renderRep(payment(), { allowRepMutations: false });
    expect(screen.queryByRole("button", { name: "Timbrar REP" })).not.toBeInTheDocument();
  });

  it("requires a stamped PPD parent invoice", () => {
    renderRep(payment(), { ppdStamped: false });
    expect(screen.queryByRole("button", { name: "Timbrar REP" })).not.toBeInTheDocument();
  });

  it("keeps the pending banner consistent with recovery eligibility", () => {
    const { Wrapper } = createQueryWrapper();
    render(<InvoicePaymentSummary totalPaid={348} balance={0} ppdStamped payments={[
      payment(), payment({ id: "none", rep_cfdi_status: "none" }),
      payment({ id: "uncertain", rep_cfdi_status: "stamping" }),
    ]} />, { wrapper: Wrapper });
    expect(screen.getByText(/2 pagos sin Complemento de Pago/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Timbrar REP" })).toHaveLength(2);
  });

  it("does not infer a retry from missing claim/error metadata", () => {
    renderRep(payment({ rep_cfdi_status: "stamping", rep_error_message: null, rep_stamping_started_at: null }));
    expect(screen.queryByRole("button", { name: "Timbrar REP" })).not.toBeInTheDocument();
  });

  it("disables a stale eligible row when its authoritative refetch failed", () => {
    mocks.blocked.add(payment().id);
    renderRep(payment());
    const button = screen.getByRole("button", { name: "Timbrar REP" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", expect.stringContaining("Recarga la página"));
    fireEvent.click(button);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});

describe("real REP handler to recovery UI (offline DI)", () => {
  it.each([6, 60, 1440])("rejects a direct request for stamping older than %s minutes before claim or PAC", async (minutes) => {
    const now = Date.parse("2026-10-19T12:00:00Z");
    vi.spyOn(Date, "now").mockReturnValue(now);
    mocks.pacBoundary.mockResolvedValue({ id: "must-not-create", status: "pending" });
    const { response, service } = await runHandler({ paymentOverrides: {
      rep_cfdi_status: "stamping", rep_stamping_started_at: new Date(now - minutes * 60_000).toISOString(),
    } });
    expect(response.status).toBe(409);
    expect(service.rpcCalls).toHaveLength(0);
    expect(service.updates).toHaveLength(0);
    expect(mocks.pacBoundary).not.toHaveBeenCalled();
  });

  it("rejects an existing UUID even when the local status incorrectly says pending", async () => {
    mocks.pacBoundary.mockResolvedValue({ id: "must-not-create", status: "pending" });
    const { response, service } = await runHandler({ paymentOverrides: {
      rep_cfdi_status: "pending", rep_cfdi_uuid: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
    } });
    expect(response.status).toBe(409);
    expect(service.rpcCalls).toHaveLength(0);
    expect(mocks.pacBoundary).not.toHaveBeenCalled();
  });
  it("makes a pre-PAC configuration failure recoverable without provider identifiers", async () => {
    mocks.config.mockResolvedValue({ ok: false, status: 400, message: "Falta configuración fiscal de esta empresa" });
    const { response, persisted, service } = await runHandler();
    expect(response.status).toBe(400);
    expect(mocks.pacBoundary).not.toHaveBeenCalled();
    expect(service.updates).toContainEqual(expect.objectContaining({ patch: {
      rep_cfdi_status: "pending", rep_stamping_started_at: null,
      rep_error_message: "Falta configuración fiscal de esta empresa",
    } }));
    renderRep(persisted);
    fireEvent.click(screen.getByRole("button", { name: "Timbrar REP" }));
    expect(mocks.mutate).toHaveBeenCalledExactlyOnceWith(persisted.id);
  });

  it("keeps a provider timeout in stamping, without exposing a manual reissue", async () => {
    mocks.pacBoundary.mockRejectedValue(new FacturapiTimeoutError(1));
    const { response, persisted, service } = await runHandler();
    expect(response.status).toBe(504);
    expect((await response.json()).code).toBe("TIMEOUT");
    expect(persisted.rep_cfdi_status).toBe("stamping");
    expect(service.updates).toHaveLength(0);
    renderRep(persisted);
    expect(screen.queryByRole("button", { name: "Timbrar REP" })).not.toBeInTheDocument();
  });

  it.each([
    ["lost response", new TypeError("Failed to fetch")],
    ["invalid response", new SyntaxError("Unexpected end of JSON input")],
    ["HTTP 500", Object.assign(new Error("Provider unavailable"), { status: 500 })],
    ["HTTP 408", Object.assign(new Error("Request timeout"), { status: 408 })],
    ["HTTP 409", Object.assign(new Error("Idempotency conflict"), { status: 409 })],
    ["HTTP 425", Object.assign(new Error("Too early"), { status: 425 })],
    ["HTTP 429", Object.assign(new Error("Too many requests"), { status: 429 })],
  ])("keeps %s uncertain for reconciliation instead of making it retryable", async (_, error) => {
    mocks.pacBoundary.mockRejectedValue(error);
    const { response, persisted, service } = await runHandler();
    expect(response.status).toBe(502);
    expect(persisted.rep_cfdi_status).toBe("stamping");
    expect(service.updates).not.toContainEqual(expect.objectContaining({
      patch: expect.objectContaining({ rep_cfdi_status: "error" }),
    }));
    expect(service.updates).toContainEqual(expect.objectContaining({
      patch: { rep_error_message: expect.stringContaining("PAC") },
    }));
    expect((await response.json()).code).toBe("PAC_UNCERTAIN");
    renderRep(persisted);
    expect(screen.queryByRole("button", { name: "Timbrar REP" })).not.toBeInTheDocument();
    const payload = mocks.pacBoundary.mock.calls[0][1];
    expect(payload).toMatchObject({ external_id: persisted.id, idempotency_key: persisted.id });
    expect(mocks.pacBoundary).toHaveBeenCalledTimes(1);
  });

  it.each([400, 401, 403, 422])("retains definite HTTP %s rejection as error and allows correction/retry", async (status) => {
    mocks.pacBoundary.mockRejectedValue(Object.assign(new Error("Invalid receptor"), { status }));
    const { response, persisted } = await runHandler();
    expect(response.status).toBe(502);
    expect(persisted.rep_cfdi_status).toBe("error");
    renderRep(persisted);
    expect(screen.getByRole("button", { name: "Timbrar REP" })).toBeEnabled();
  });

  it("keeps an accepted REP without UUID in stamping and blocks manual reissue", async () => {
    mocks.pacBoundary.mockResolvedValue({ id: "synthetic-pac-id", status: "pending" });
    const { response, persisted } = await runHandler();
    expect(response.status).toBe(202);
    expect(persisted).toMatchObject({ rep_cfdi_status: "stamping", rep_facturapi_id: "synthetic-pac-id" });
    renderRep(persisted);
    expect(screen.queryByRole("button", { name: "Timbrar REP" })).not.toBeInTheDocument();
  });

  it("preserves handler role restrictions", async () => {
    const { response, service } = await runHandler({ role: "dispatcher" });
    expect(response.status).toBe(403);
    expect(service.rpcCalls).toHaveLength(0);
    expect(mocks.pacBoundary).not.toHaveBeenCalled();
  });

  it("preserves rejection of an active claim", async () => {
    const { response, service } = await runHandler({ claim: "stamping" });
    expect(response.status).toBe(409);
    expect(service.updates).toHaveLength(0);
    expect(mocks.pacBoundary).not.toHaveBeenCalled();
  });
});
