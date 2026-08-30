import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import {
  createSupabaseChainMock,
  type SupabaseMockResponse,
} from "@/test/helpers/supabaseChain";
import { notifyError } from "@/lib/ui/appFeedback";

/**
 * v7.381.1: el guard de BD `trg_guard_invoice_sale_assignment` puede rechazar
 * el INSERT por carrera/estado obsoleto aunque la UI determinística
 * (SaleAssignmentBlocked) ya prevenía el caso normal. Verificamos que el
 * rechazo P0001 llega a `onBusinessBlock` con el bloque canónico y que el
 * toast genérico de error se suprime.
 */
let insertResp: SupabaseMockResponse = { data: { id: "inv-1" }, error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    rpcResolvers: {
      next_draft_invoice_number: () => ({ data: "DRAFT-9999", error: null }),
    },
    tableResolvers: {
      invoices: () => insertResp,
    },
  }),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));

import { useCreateInvoice } from "../invoices/useInvoices";

const P0001_MESSAGE =
  "No se puede facturar: la cotización de venta tiene 2 equipo(s) sin asignar";

describe("useCreateInvoice — bloqueo explicable por guard de asignación", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertResp = { data: { id: "inv-1" }, error: null };
  });

  it("rechazo P0001 del guard → onBusinessBlock recibe el bloque y no hay toast genérico", async () => {
    insertResp = { data: null, error: { code: "P0001", message: P0001_MESSAGE } };
    const onBusinessBlock = vi.fn();
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(
      () => useCreateInvoice({ onBusinessBlock }),
      { wrapper: Wrapper },
    );

    result.current.mutate({ quote_id: "q-1", customer_name: "Cliente X" } as never);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(onBusinessBlock).toHaveBeenCalledTimes(1);
    expect(onBusinessBlock.mock.calls[0][0].code).toBe("quote_sale_assignment_incomplete");
    expect(notifyError).not.toHaveBeenCalled();
  });

  it("error no relacionado sigue mostrando el toast estándar", async () => {
    insertResp = { data: null, error: { code: "23505", message: "duplicate key value" } };
    const onBusinessBlock = vi.fn();
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(
      () => useCreateInvoice({ onBusinessBlock }),
      { wrapper: Wrapper },
    );

    result.current.mutate({ quote_id: "q-1", customer_name: "Cliente X" } as never);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(onBusinessBlock).not.toHaveBeenCalled();
    expect(notifyError).toHaveBeenCalled();
  });
});
