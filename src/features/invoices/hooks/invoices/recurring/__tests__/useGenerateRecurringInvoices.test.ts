import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

/**
 * useGenerateRecurringInvoices — motor de cobro recurrente.
 *
 * Riesgo: si esta Edge Function falla silenciosamente o devuelve invoicesCreated
 * incorrecto, las facturas no se generan y el MRR se inflama sin facturar.
 */

const { toastSuccess, toastInfo, notifyErrorMock } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
  notifyErrorMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccess, info: toastInfo, error: vi.fn() },
}));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: notifyErrorMock,
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));

let invokeResp: { data: unknown; error: { message: string } | null } = {
  data: { invoicesCreated: 0 },
  error: null,
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    functionsResolvers: {
      "generate-recurring-invoices": () => invokeResp,
    },
  }),
}));

import { useGenerateRecurringInvoices } from "../useGenerateRecurringInvoices";

describe("useGenerateRecurringInvoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invokeResp = { data: { invoicesCreated: 0 }, error: null };
  });

  it("invocación exitosa con count > 0 → toast.success con número exacto", async () => {
    invokeResp = { data: { invoicesCreated: 3 }, error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useGenerateRecurringInvoices(), { wrapper: Wrapper });

    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(toastSuccess).toHaveBeenCalledWith(
      "3 factura(s) generada(s)",
      expect.objectContaining({ description: expect.stringContaining("borradores") }),
    );
  });

  it("invocación exitosa con count = 0 → toast informativo de 'Sin facturas pendientes'", async () => {
    invokeResp = { data: { invoicesCreated: 0 }, error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useGenerateRecurringInvoices(), { wrapper: Wrapper });

    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(toastSuccess).toHaveBeenCalledWith(
      "Sin facturas pendientes",
      expect.objectContaining({ description: expect.any(String) }),
    );
  });

  it("respuesta sin invoicesCreated (null) → trata como 0, no rompe", async () => {
    invokeResp = { data: null, error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useGenerateRecurringInvoices(), { wrapper: Wrapper });

    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(toastSuccess).toHaveBeenCalledWith("Sin facturas pendientes", expect.any(Object));
  });

  it("error de Edge Function → notifyError, mutación marcada como error", async () => {
    invokeResp = { data: null, error: { message: "Function timeout" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useGenerateRecurringInvoices(), { wrapper: Wrapper });

    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(notifyErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Error al generar facturas" }),
    );
  });
});
