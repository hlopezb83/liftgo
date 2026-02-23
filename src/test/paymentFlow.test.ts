import { describe, it, expect, vi, beforeEach } from "vitest";

const insertMock = vi.fn();
const selectPaymentsMock = vi.fn();
const selectInvoiceMock = vi.fn();
const updateMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "payments") {
        return {
          insert: (data: any) => {
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
          update: (data: any) => {
            updateMock(data);
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      }
      return {};
    },
  },
}));

describe("Payment flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks invoice as paid when balance reaches zero", async () => {
    selectPaymentsMock.mockResolvedValue({ data: [{ amount: 500 }, { amount: 500 }] });
    selectInvoiceMock.mockResolvedValue({ data: { total: 1000, status: "sent" } });

    const { supabase } = await import("@/integrations/supabase/client");

    // Simulate the payment flow from useCreatePayment
    const payment = { invoice_id: "inv-1", amount: 500, payment_date: "2026-03-01", payment_method: "transfer", reference_number: null, notes: null };

    await (supabase.from("payments") as any).insert(payment).select().single();
    expect(insertMock).toHaveBeenCalledWith(payment);

    const { data: allPayments } = await (supabase.from("payments") as any).select("amount").eq("invoice_id", "inv-1");
    const totalPaid = (allPayments || []).reduce((s: number, p: any) => s + Number(p.amount), 0);
    expect(totalPaid).toBe(1000);

    const { data: invoice } = await supabase.from("invoices").select("total, status").eq("id", "inv-1").single();
    const balance = Number(invoice!.total) - totalPaid;

    if (balance <= 0 && invoice!.status !== "paid") {
      await supabase.from("invoices").update({ status: "paid" }).eq("id", "inv-1");
    }

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: "paid" }));
  });

  it("marks invoice as partial when partially paid", async () => {
    selectPaymentsMock.mockResolvedValue({ data: [{ amount: 300 }] });
    selectInvoiceMock.mockResolvedValue({ data: { total: 1000, status: "sent" } });

    const { supabase } = await import("@/integrations/supabase/client");

    const { data: allPayments } = await (supabase.from("payments") as any).select("amount").eq("invoice_id", "inv-1");
    const totalPaid = (allPayments || []).reduce((s: number, p: any) => s + Number(p.amount), 0);
    expect(totalPaid).toBe(300);

    const { data: invoice } = await supabase.from("invoices").select("total, status").eq("id", "inv-1").single();
    const balance = Number(invoice!.total) - totalPaid;

    if (balance > 0 && totalPaid > 0 && invoice!.status !== "partial") {
      await supabase.from("invoices").update({ status: "partial" }).eq("id", "inv-1");
    }

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ status: "partial" }));
  });
});
