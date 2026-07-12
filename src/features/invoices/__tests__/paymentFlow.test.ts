import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCreatePayment } from "@/features/invoices";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import type { ChainCall, SupabaseMockResponse } from "@/test/helpers/supabaseChain";

interface PaymentRow {
  amount: number;
  payment_date?: string;
}
interface InvoiceRow {
  total: number;
  status: string;
}

// Estado mutable hoisted — vi.mock se eleva sobre los imports.
const state = vi.hoisted(() => ({
  paymentInsertResp: { data: { id: "pay-1" }, error: null } as SupabaseMockResponse,
  paymentsListResp: [] as { amount: number; payment_date?: string }[],
  invoiceRow: { total: 1000, status: "sent" } as { total: number; status: string },
  invoiceUpdateResp: { data: [{ id: "inv-1" }], error: null } as SupabaseMockResponse,
  paymentsCalls: [] as ChainCall[],
  invoicesCalls: [] as ChainCall[],
}));

vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseChainMock } = await import("@/test/helpers/supabaseChain");
  return {
    supabase: createSupabaseChainMock({
      tableResolvers: {
        payments: (calls) => {
          state.paymentsCalls.push(...calls);
          if (calls.some((c) => c.method === "insert")) return state.paymentInsertResp;
          return { data: state.paymentsListResp, error: null };
        },
        invoices: (calls) => {
          state.invoicesCalls.push(...calls);
          if (calls.some((c) => c.method === "update")) return state.invoiceUpdateResp;
          return { data: state.invoiceRow, error: null };
        },
      },
    }),
  };
});


describe("useCreatePayment + syncInvoiceStatus — hooks reales", () => {
  beforeEach(() => {
    state.paymentInsertResp = { data: { id: "pay-1" }, error: null };
    state.paymentsListResp = [];
    state.invoiceRow = { total: 1000, status: "sent" };
    state.invoiceUpdateResp = { data: [{ id: "inv-1" }], error: null };
    state.paymentsCalls.length = 0;
    state.invoicesCalls.length = 0;
  });

  it("pago completo → marca factura como paid con paid_at = max(payment_date)", async () => {
    state.paymentsListResp = [
      { amount: 500, payment_date: "2026-03-01" },
      { amount: 500, payment_date: "2026-03-05" },
    ];
    state.invoiceRow = { total: 1000, status: "sent" };

    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreatePayment(), { wrapper: Wrapper });

    await result.current.mutateAsync({
      invoice_id: "inv-1",
      amount: 500,
      payment_date: "2026-03-05",
      payment_method: "transfer",
      reference_number: null,
      notes: null,
    });

    const updateCall = state.invoicesCalls.find((c) => c.method === "update");
    expect(updateCall).toBeDefined();
    expect(updateCall?.args[0]).toMatchObject({ status: "paid", paid_at: "2026-03-05" });
  });

  it("pago parcial → marca factura como partial sin paid_at", async () => {
    state.paymentsListResp = [{ amount: 300, payment_date: "2026-03-01" }];
    state.invoiceRow = { total: 1000, status: "sent" };

    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreatePayment(), { wrapper: Wrapper });

    await result.current.mutateAsync({
      invoice_id: "inv-1",
      amount: 300,
      payment_date: "2026-03-01",
      payment_method: "transfer",
      reference_number: null,
      notes: null,
    });

    const updateCall = state.invoicesCalls.find((c) => c.method === "update");
    expect(updateCall).toBeDefined();
    expect(updateCall?.args[0]).toMatchObject({ status: "partial", paid_at: null });
  });

  it("error de RLS en insert de pago → rechaza y NO actualiza factura", async () => {
    state.paymentInsertResp = {
      data: null,
      error: { code: "42501", message: "permission denied for table payments" },
    };

    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreatePayment(), { wrapper: Wrapper });

    await expect(
      result.current.mutateAsync({
        invoice_id: "inv-1",
        amount: 100,
        payment_date: "2026-03-01",
        payment_method: "transfer",
        reference_number: null,
        notes: null,
      }),
    ).rejects.toMatchObject({ code: "42501" });

    expect(state.invoicesCalls.find((c) => c.method === "update")).toBeUndefined();
  });

  it("no toca status si no hay cambio (factura ya paid sin pagos nuevos)", async () => {
    state.paymentsListResp = [{ amount: 1000, payment_date: "2026-03-01" }];
    state.invoiceRow = { total: 1000, status: "paid" };

    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreatePayment(), { wrapper: Wrapper });

    await result.current.mutateAsync({
      invoice_id: "inv-1",
      amount: 0,
      payment_date: "2026-03-01",
      payment_method: "transfer",
      reference_number: null,
      notes: null,
    });

    expect(state.invoicesCalls.find((c) => c.method === "update")).toBeUndefined();
  });
});

// PaymentRow/InvoiceRow interfaces retained as documentation reference.
export type _PaymentRow = PaymentRow;
export type _InvoiceRow = InvoiceRow;
