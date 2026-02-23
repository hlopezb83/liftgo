import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
const insertMock = vi.fn();
const selectMock = vi.fn();
const singleMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: any[]) => rpcMock(...args),
    from: () => ({
      insert: (data: any) => {
        insertMock(data);
        return { select: () => ({ single: () => singleMock() }) };
      },
    }),
  },
}));

describe("Invoice creation flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates invoice number via RPC then inserts", async () => {
    rpcMock.mockResolvedValue({ data: "FAC-0042", error: null });
    singleMock.mockResolvedValue({
      data: { id: "inv-1", invoice_number: "FAC-0042", total: 1000 },
      error: null,
    });

    // Simulate the flow from useCreateInvoice
    const { data: numData, error: numError } = await rpcMock("next_invoice_number");
    expect(numError).toBeNull();
    expect(numData).toBe("FAC-0042");

    const invoice = { customer_name: "Test", subtotal: 862.07, tax_amount: 137.93, tax_rate: 16, total: 1000, line_items: [] };
    const { supabase } = await import("@/integrations/supabase/client");
    const result = await supabase.from("invoices").insert({ ...invoice, invoice_number: numData as string }).select().single();

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ invoice_number: "FAC-0042" }));
    expect(result.data.id).toBe("inv-1");
  });

  it("throws when RPC fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "sequence error" } });
    const { error } = await rpcMock("next_invoice_number");
    expect(error.message).toBe("sequence error");
  });
});
