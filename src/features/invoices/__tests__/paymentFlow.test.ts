import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCreatePayment } from "@/features/invoices";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import {
  createSupabaseChainMock,
  type ChainCall,
  type SupabaseMockResponse,
} from "@/test/helpers/supabaseChain";

interface PaymentRow {
  amount: number;
  payment_date?: string;
}
interface InvoiceRow {
  total: number;
  status: string;
}

// Estado mutable por test.
let paymentInsertResp: SupabaseMockResponse = {
  data: { id: "pay-1" },
  error: null,
};
let paymentsListResp: PaymentRow[] = [];
let invoiceRow: InvoiceRow = { total: 1000, status: "sent" };
let invoiceUpdateResp: SupabaseMockResponse = {
  data: [{ id: "inv-1" }],
  error: null,
};

const paymentsCalls: ChainCall[] = [];
const invoicesCalls: ChainCall[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      payments: (calls) => {
        paymentsCalls.push(...calls);
        // Si la cadena empieza con insert → respuesta de inserción.
        if (calls.some((c) => c.method === "insert")) return paymentInsertResp;
        // Si es select(...).eq(...) → lista de pagos.
        return { data: paymentsListResp, error: null };
      },
      invoices: (calls) => {
        invoicesCalls.push(...calls);
        if (calls.some((c) => c.method === "update")) return invoiceUpdateResp;
        // select("total, status").eq("id", id).single()
        return { data: invoiceRow, error: null };
      },
    },
  }),
}));


describe("useCreatePayment + syncInvoiceStatus — hooks reales", () => {
  beforeEach(() => {
    paymentInsertResp = { data: { id: "pay-1" }, error: null };
    paymentsListResp = [];
    invoiceRow = { total: 1000, status: "sent" };
    invoiceUpdateResp = { data: [{ id: "inv-1" }], error: null };
    paymentsCalls.length = 0;
    invoicesCalls.length = 0;
  });

  it("pago completo → marca factura como paid con paid_at = max(payment_date)", async () => {
    paymentsListResp = [
      { amount: 500, payment_date: "2026-03-01" },
      { amount: 500, payment_date: "2026-03-05" },
    ];
    invoiceRow = { total: 1000, status: "sent" };

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

    const updateCall = invoicesCalls.find((c) => c.method === "update");
    expect(updateCall).toBeDefined();
    expect(updateCall?.args[0]).toMatchObject({ status: "paid", paid_at: "2026-03-05" });
  });

  it("pago parcial → marca factura como partial sin paid_at", async () => {
    paymentsListResp = [{ amount: 300, payment_date: "2026-03-01" }];
    invoiceRow = { total: 1000, status: "sent" };

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

    const updateCall = invoicesCalls.find((c) => c.method === "update");
    expect(updateCall).toBeDefined();
    expect(updateCall?.args[0]).toMatchObject({ status: "partial", paid_at: null });
  });

  it("error de RLS en insert de pago → rechaza y NO actualiza factura", async () => {
    paymentInsertResp = {
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

    expect(invoicesCalls.find((c) => c.method === "update")).toBeUndefined();
  });

  it("no toca status si no hay cambio (factura ya paid sin pagos nuevos)", async () => {
    paymentsListResp = [{ amount: 1000, payment_date: "2026-03-01" }];
    invoiceRow = { total: 1000, status: "paid" };

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

    expect(invoicesCalls.find((c) => c.method === "update")).toBeUndefined();
  });
});
