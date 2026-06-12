import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  createSupabaseChainMock,
  type ChainCall,
  type SupabaseMockResponse,
} from "@/test/helpers/supabaseChain";
import { createQueryWrapper } from "@/test/helpers/queryClient";

let nextNumberResp: SupabaseMockResponse = { data: "FAC-0042", error: null };
let invoiceInsertResp: SupabaseMockResponse = {
  data: { id: "inv-1", invoice_number: "FAC-0042", total: 1000 },
  error: null,
};
const invoicesCalls: ChainCall[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    rpcResolvers: {
      next_invoice_number: () => nextNumberResp,
    },
    tableResolvers: {
      invoices: (calls) => {
        invoicesCalls.push(...calls);
        return invoiceInsertResp;
      },
    },
  }),
}));

const notifyErrorMock = vi.fn();
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: (...args: unknown[]) => notifyErrorMock(...args),
}));

import { useCreateInvoice } from "@/features/invoices/hooks/invoices/useInvoices";

describe("useCreateInvoice — hook real", () => {
  beforeEach(() => {
    nextNumberResp = { data: "FAC-0042", error: null };
    invoiceInsertResp = {
      data: { id: "inv-1", invoice_number: "FAC-0042", total: 1000 },
      error: null,
    };
    invoicesCalls.length = 0;
    notifyErrorMock.mockClear();
  });

  it("genera numero via next_invoice_number y luego inserta con ese numero", async () => {
    const { Wrapper, queryClient } = createQueryWrapper();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCreateInvoice(), { wrapper: Wrapper });

    const created = await result.current.mutateAsync({
      customer_name: "Cliente Test",
      subtotal: 862.07,
      tax_amount: 137.93,
      tax_rate: 16,
      total: 1000,
      line_items: [],
    } as unknown as Parameters<typeof result.current.mutateAsync>[0]);

    expect(created).toMatchObject({ id: "inv-1", invoice_number: "FAC-0042" });

    const insertCall = invoicesCalls.find((c) => c.method === "insert");
    expect(insertCall).toBeDefined();
    expect(insertCall?.args[0]).toMatchObject({
      invoice_number: "FAC-0042",
      customer_name: "Cliente Test",
      subtotal: 862.07,
      tax_amount: 137.93,
      total: 1000,
    });

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["invoices"] }),
    );
    expect(notifyErrorMock).not.toHaveBeenCalled();
  });

  it("si next_invoice_number falla, NO ejecuta el insert", async () => {
    nextNumberResp = { data: null, error: { message: "sequence error" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateInvoice(), { wrapper: Wrapper });

    await expect(
      result.current.mutateAsync({
        customer_name: "X",
        subtotal: 0,
        tax_amount: 0,
        tax_rate: 16,
        total: 0,
        line_items: [],
      } as unknown as Parameters<typeof result.current.mutateAsync>[0]),
    ).rejects.toMatchObject({ message: "sequence error" });

    expect(invoicesCalls.find((c) => c.method === "insert")).toBeUndefined();
    await waitFor(() =>
      expect(notifyErrorMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Error al crear factura" }),
      ),
    );
  });

  it("propaga error de RLS en insert", async () => {
    invoiceInsertResp = {
      data: null,
      error: { code: "42501", message: "permission denied for table invoices" },
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreateInvoice(), { wrapper: Wrapper });

    await expect(
      result.current.mutateAsync({
        customer_name: "X",
        subtotal: 0,
        tax_amount: 0,
        tax_rate: 16,
        total: 0,
        line_items: [],
      } as unknown as Parameters<typeof result.current.mutateAsync>[0]),
    ).rejects.toMatchObject({ code: "42501" });

    await waitFor(() =>
      expect(notifyErrorMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Error al crear factura" }),
      ),
    );
  });
});
