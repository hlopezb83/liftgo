import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { notifySuccess } from "@/lib/ui/appFeedback";

// Mock supabase antes del import de las mutations.
const mockQueue: Array<Record<string, unknown>> = [];
const enqueue = (value: Record<string, unknown>) => mockQueue.push(value);

vi.mock("@/integrations/supabase/client", () => {
  function chain() {
    const state: { table: string; op: string } = { table: "", op: "" };
    const api: Record<string, unknown> = {
      from: (t: string) => { state.table = t; return api; },
      select: () => api,
      eq: () => api,
      insert: () => api,
      update: () => api,
      delete: () => api,
      single: () => Promise.resolve(mockQueue.shift() ?? { data: null, error: null }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(mockQueue.shift() ?? { data: null, error: null, count: 0 }).then(resolve),
    };
    // devuelve el api para permitir chain
    return api;
  }
  const c = chain();
  return { supabase: { from: c.from } };
});

vi.mock("@/lib/ui/appFeedback", () => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
  notifyValidation: vi.fn(),
}));

import { useDeleteSupplierBill, useCancelSupplierBill } from "../useSupplierBillMutations";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useDeleteSupplierBill / useCancelSupplierBill (BL-22)", () => {
  beforeEach(() => { mockQueue.length = 0; vi.clearAllMocks(); });

  it("rechaza eliminar cuando hay pagos registrados", async () => {
    enqueue({ data: null, error: null, count: 3 }); // conteo de pagos
    const { result } = renderHook(() => useDeleteSupplierBill(), { wrapper });
    result.current.mutate("bill-1");
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(String(result.current.error)).toMatch(/pagos registrados/i);
  });

  it("rechaza cancelar cuando hay pagos registrados", async () => {
    enqueue({ data: null, error: null, count: 1 });
    const { result } = renderHook(() => useCancelSupplierBill(), { wrapper });
    result.current.mutate({ id: "bill-1" });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(String(result.current.error)).toMatch(/pagos registrados/i);
  });

  it("permite eliminar cuando no hay pagos", async () => {
    enqueue({ data: null, error: null, count: 0 }); // conteo
    enqueue({ data: [{ id: "bill-1" }], error: null }); // delete returning
    const { result } = renderHook(() => useDeleteSupplierBill(), { wrapper });
    result.current.mutate("bill-1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("rechaza eliminar si no se afectó ninguna factura y no informa éxito", async () => {
    enqueue({ data: null, error: null, count: 0 });
    enqueue({ data: [], error: null });
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useDeleteSupplierBill(), { wrapper });
    result.current.mutate("bill-inaccesible", { onSuccess });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(String(result.current.error)).toMatch(/no se modificó ningún registro/i);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(notifySuccess).not.toHaveBeenCalled();
  });

  it("rechaza cancelar si no se afectó ninguna factura y no informa éxito", async () => {
    enqueue({ data: null, error: null, count: 0 });
    enqueue({ data: [], error: null });
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useCancelSupplierBill(), { wrapper });
    result.current.mutate({ id: "bill-inaccesible" }, { onSuccess });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(String(result.current.error)).toMatch(/no se modificó ningún registro/i);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(notifySuccess).not.toHaveBeenCalled();
  });
});
