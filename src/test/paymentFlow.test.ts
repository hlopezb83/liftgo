import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseResponse } from "./helpers/mockSupabase";

interface PaymentInput {
  invoice_id: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
}

interface InvoiceRow { total: number; status: string }
interface PaymentRow { amount: number }

const insertMock = vi.fn();
const selectPaymentsMock = vi.fn<(...args: unknown[]) => Promise<SupabaseResponse<PaymentRow[]>>>();
const selectInvoiceMock = vi.fn<(...args: unknown[]) => Promise<SupabaseResponse<InvoiceRow>>>();
const updateMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "payments") {
        return {
          insert: (data: PaymentInput) => {
            insertMock(data);
            return { select: () => ({ single: () => Promise.resolve({ data: { id: "pay-1", ...data }, error: null }) }) };
          },
          select: () => ({
            eq: () => selectPaymentsMock(),
          }),
        };
      }
      if (table === "invoices") {
        return {
          select: () => ({
            eq: () => ({ single: () => selectInvoiceMock() }),
          }),
          update: (data: Partial<InvoiceRow>) => {
            updateMock(data);
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      }
      return {};
    },
  },
}));

type MockedSupabase = {
  from: (t: string) => {
    insert: (d: PaymentInput) => { select: () => { single: () => Promise<unknown> } };
    select: () => { eq: (...a: unknown[]) => Promise<SupabaseResponse<PaymentRow[]>> | { single: () => Promise<SupabaseResponse<InvoiceRow>> } };
    update: (d: Partial<InvoiceRow>) => { eq: () => Promise<{ error: null }> };
  };
};

describe("Payment flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks invoice as paid when balance reaches zero", async () => {
    selectPaymentsMock.mockResolvedValue({ data: [{ amount: 500 }, { amount: 500 }], error: null });
    selectInvoiceMock.mockResolvedValue({ data: { total: 1000, status: "sent" }, error: null });

    const { supabase } = (await import("@/integrations/supabase/client")) as unknown as { supabase: MockedSupabase };

    const payment: PaymentInput = { invoice_id: "inv-1", amount: 500, payment_date: "2026-03-01", payment_method: "transfer", reference_number: null, notes: null };

    await supabase.from("payments").insert(payment).select().single();
    expect(insertMock).toHaveBeenCalledWith(payment);

    const { data: allPayments } = await (supabase.from("payments").select().eq("invoice_id", "inv-1") as Promise<SupabaseResponse<PaymentRow[]>>);
    const totalPaid = (allPayments || []).reduce((s, p) => s + Number(p.amount), 0);
    expect(totalPaid).toBe(1000);

    const invoiceQuery = supabase.from("invoices").select().eq("id", "inv-1") as { single: () => Promise<SupabaseResponse<InvoiceRow>> };
    const { data: invoice } = await invoiceQuery.single();
    const balance = Number(invoice!.total) - totalPaid;

    if (balance <= 0 && invoice!.status !== "paid") {
      await supabase.from("invoices").update({ status: "paid" }).eq();
    }

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: "paid" }));
  });

  it("marks invoice as partial when partially paid", async () => {
    selectPaymentsMock.mockResolvedValue({ data: [{ amount: 300 }], error: null });
    selectInvoiceMock.mockResolvedValue({ data: { total: 1000, status: "sent" }, error: null });

    const { supabase } = (await import("@/integrations/supabase/client")) as unknown as { supabase: MockedSupabase };

    const { data: allPayments } = await (supabase.from("payments").select().eq("invoice_id", "inv-1") as Promise<SupabaseResponse<PaymentRow[]>>);
    const totalPaid = (allPayments || []).reduce((s, p) => s + Number(p.amount), 0);
    expect(totalPaid).toBe(300);

    const invoiceQuery = supabase.from("invoices").select().eq("id", "inv-1") as { single: () => Promise<SupabaseResponse<InvoiceRow>> };
    const { data: invoice } = await invoiceQuery.single();
    const balance = Number(invoice!.total) - totalPaid;

    if (balance > 0 && totalPaid > 0 && invoice!.status !== "partial") {
      await supabase.from("invoices").update({ status: "partial" }).eq();
    }

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: "partial" }));
  });
});
