import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

const { notifyErrorMock, notifyWarningMock } = vi.hoisted(() => ({
  notifyErrorMock: vi.fn(),
  notifyWarningMock: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: notifyErrorMock,
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: notifyWarningMock,
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

  it("mutación con bookingIds → devuelve respuesta con invoicesCreated", async () => {
    invokeResp = { data: { invoicesCreated: 3, created: [], failed: [] }, error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useGenerateRecurringInvoices(), { wrapper: Wrapper });

    result.current.mutate(["b1", "b2", "b3"]);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.invoicesCreated).toBe(3);
  });

  it("mutación sin bookingIds → sigue funcionando", async () => {
    invokeResp = { data: { invoicesCreated: 0, created: [], failed: [] }, error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useGenerateRecurringInvoices(), { wrapper: Wrapper });

    result.current.mutate(undefined);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.invoicesCreated).toBe(0);
  });

  it("respuesta null → no rompe", async () => {
    invokeResp = { data: null, error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useGenerateRecurringInvoices(), { wrapper: Wrapper });

    result.current.mutate(undefined);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("error de Edge Function → notifyError, mutación marcada como error", async () => {
    invokeResp = { data: null, error: { message: "Function timeout" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useGenerateRecurringInvoices(), { wrapper: Wrapper });

    result.current.mutate(undefined);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(notifyErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Error al generar facturas" }),
    );
    expect(notifyErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Error al generar facturas" }),
    );
  });

  it("BL-008: 200 con failed[] → notifyWarning con conteo y motivo truncado", async () => {
    invokeResp = {
      data: {
        invoicesCreated: 1,
        created: [{ bookingIds: ["b1"], invoiceId: "inv-1", invoiceNumber: "FAC-1" }],
        failed: [
          { bookingIds: ["b2"], error: "Cliente sin RFC configurado" },
          { bookingIds: ["b3"], error: "Sin tarifa activa" },
        ],
      },
      error: null,
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useGenerateRecurringInvoices(), { wrapper: Wrapper });

    result.current.mutate(undefined);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(notifyWarningMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "2 reserva(s) no se facturaron",
        description: "Cliente sin RFC configurado",
      }),
    );
  });

  it("BL-008: sin failed[] → no dispara notifyWarning", async () => {
    invokeResp = { data: { invoicesCreated: 2, created: [], failed: [] }, error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useGenerateRecurringInvoices(), { wrapper: Wrapper });

    result.current.mutate(undefined);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(notifyWarningMock).not.toHaveBeenCalled();
  });
});
