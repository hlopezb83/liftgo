import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { useDemoEvidence } from "../useDemoEvidence";

const mock = vi.hoisted(() => ({
  replies: [] as { data: unknown; error: Error | null }[],
  calls: [] as { table: string; method: string; args: unknown[] }[],
  from: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mock.from } }));
const invoice = {
  id: "invoice-a", organization_id: "org-a", invoice_number: "QA-001", customer_name: "DEMO Pagado",
  status: "paid", total: 100, moneda: "MXN", tipo_cambio: 1, cfdi_status: "pending", facturapi_env: null,
  cancellation_status: null, is_e2e: false, issued_at: "2026-10-01",
};
const payment = { id: "payment-a", amount: 100, currency: "MXN", exchange_rate: 1, payment_date: "2026-10-02" };
const request = { folio: "QA-001", scenario: "paid" as const };

beforeEach(() => {
  mock.replies = [];
  mock.calls = [];
  mock.from.mockReset().mockImplementation((table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "or", "limit", "returns", "neq", "range", "order"]) {
      builder[method] = (...args: unknown[]) => { mock.calls.push({ table, method, args }); return builder; };
    }
    builder.then = (resolve: (value: unknown) => void) => {
      if (!mock.replies.length) throw new Error("Unexpected read");
      return Promise.resolve(mock.replies.shift()).then(resolve);
    };
    return builder;
  });
});
const reply = (data: unknown) => mock.replies.push({ data, error: null });

function mount() {
  return renderHook(() => useDemoEvidence("org-a", "user-a", request), { wrapper: createQueryWrapper().Wrapper });
}

describe("demo evidence reads", () => {
  it("does nothing without a submitted folio or verified identity", () => {
    const { Wrapper } = createQueryWrapper();
    renderHook(() => useDemoEvidence("org-a", "user-a", null), { wrapper: Wrapper });
    renderHook(() => useDemoEvidence("", "user-a", request), { wrapper: Wrapper });
    renderHook(() => useDemoEvidence("org-a", "", request), { wrapper: Wrapper });
    expect(mock.from).not.toHaveBeenCalled();
  });

  it("scopes all reads to the organization and exact document, without writes", async () => {
    reply([invoice]); reply([]); reply([payment]); reply([]);
    const { result } = mount();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ paid: 100, balance: 0 });
    for (const table of ["invoices", "credit_notes", "payments"]) {
      expect(mock.calls).toContainEqual({ table, method: "eq", args: ["organization_id", "org-a"] });
    }
    expect(mock.calls).toContainEqual({ table: "invoices", method: "eq", args: ["invoice_number", "QA-001"] });
    expect(mock.calls).toContainEqual({ table: "payments", method: "eq", args: ["invoice_id", "invoice-a"] });
    expect(mock.calls).toContainEqual({ table: "payments", method: "range", args: [1, 500] });
    expect(mock.from.mock.calls.map(([table]) => table)).toEqual(["invoices", "credit_notes", "payments", "payments"]);
  });

  it("continues pagination to an empty page instead of truncating at a server cap", async () => {
    reply([invoice]); reply([]); reply([{ ...payment, amount: 40 }]);
    reply([{ ...payment, id: "payment-b", amount: 60 }]); reply([]);
    const { result } = mount();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.payments).toHaveLength(2);
    expect(result.current.data?.paid).toBe(100);
  });

  it.each([
    { rows: [] }, { rows: [invoice, invoice] },
    { rows: [{ ...invoice, organization_id: "org-b" }] },
    { rows: [{ ...invoice, customer_name: "Operativo" }] },
  ])(
    "fails closed before fetching financial history for an unavailable fixture", async ({ rows }) => {
      reply(rows);
      const { result } = mount();
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toBeNull();
      expect(mock.from).toHaveBeenCalledTimes(1);
    },
  );

  it("does not treat credit-settled invoices as paid scenarios", async () => {
    reply([invoice]); reply([{ id: "credit-a" }]);
    const { result } = mount();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(mock.from).toHaveBeenCalledTimes(2);
  });

  it("surfaces a read failure rather than claiming a missing fixture or zero balance", async () => {
    reply([invoice]); reply([]);
    mock.replies.push({ data: null, error: new Error("Unavailable") });
    const { result } = mount();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
