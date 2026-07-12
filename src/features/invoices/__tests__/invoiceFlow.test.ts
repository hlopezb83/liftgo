import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useCreateInvoice } from "@/features/invoices";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import type { ChainCall, SupabaseMockResponse } from "@/test/helpers/supabaseChain";

// Estado mutable hoisted — vi.mock se eleva sobre los imports, por lo que
// cualquier variable que use el factory debe crearse dentro de vi.hoisted().
const state = vi.hoisted(() => ({
  nextNumberResp: { data: "BORRADOR-0042", error: null } as SupabaseMockResponse,
  invoiceInsertResp: {
    data: { id: "inv-1", invoice_number: "BORRADOR-0042", total: 1000 },
    error: null,
  } as SupabaseMockResponse,
  invoicesCalls: [] as ChainCall[],
}));

vi.mock("@/integrations/supabase/client", async () => {
  const { createSupabaseChainMock } = await import("@/test/helpers/supabaseChain");
  return {
    supabase: createSupabaseChainMock({
      rpcResolvers: {
        next_draft_invoice_number: () => state.nextNumberResp,
      },
      tableResolvers: {
        invoices: (calls) => {
          state.invoicesCalls.push(...calls);
          return state.invoiceInsertResp;
        },
      },
    }),
  };
});

const notifyErrorMock = vi.fn();
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: (...args: unknown[]) => notifyErrorMock(...args),
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));


describe("useCreateInvoice — hook real", () => {
  beforeEach(() => {
    state.nextNumberResp = { data: "BORRADOR-0042", error: null };
    state.invoiceInsertResp = {
      data: { id: "inv-1", invoice_number: "BORRADOR-0042", total: 1000 },
      error: null,
    };
    state.invoicesCalls.length = 0;
    notifyErrorMock.mockClear();
  });


  it("genera numero via next_draft_invoice_number y luego inserta con ese numero", async () => {
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

    expect(created).toMatchObject({ id: "inv-1", invoice_number: "BORRADOR-0042" });

    const insertCall = invoicesCalls.find((c) => c.method === "insert");
    expect(insertCall).toBeDefined();
    expect(insertCall?.args[0]).toMatchObject({
      invoice_number: "BORRADOR-0042",
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

  it("si next_draft_invoice_number falla, NO ejecuta el insert", async () => {
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
