import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import {
  createSupabaseChainMock,
  type ChainCall,
  type SupabaseMockResponse,
} from "@/test/helpers/supabaseChain";

/**
 * PERF-003: `useSyncInvoiceBookings` valida que el número de filas insertadas
 * coincida con las reservas solicitadas. Estos tests garantizan que:
 *   1. El flujo happy-path invalida y cierra correctamente.
 *   2. Si RLS/trigger devuelve menos filas de las esperadas, se lanza error.
 *   3. El caso `bookingIds = []` solo hace delete y no falla.
 */

let insertResp: SupabaseMockResponse = { data: [], error: null };
let deleteResp: SupabaseMockResponse = { data: [], error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      invoice_bookings: (calls: ChainCall[]) => {
        const isInsert = calls.some((c) => c.method === "insert");
        return isInsert ? insertResp : deleteResp;
      },
    },
  }),
}));

import { useSyncInvoiceBookings } from "../invoices/useInvoiceBookings";

describe("useSyncInvoiceBookings — PERF-003 validación de filas afectadas", () => {
  it("resuelve cuando el insert devuelve exactamente las filas solicitadas", async () => {
    deleteResp = { data: [{ invoice_id: "inv-1" }], error: null };
    insertResp = {
      data: [{ invoice_id: "inv-1" }, { invoice_id: "inv-1" }],
      error: null,
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useSyncInvoiceBookings(), { wrapper: Wrapper });

    result.current.mutate({ invoiceId: "inv-1", bookingIds: ["b-1", "b-2"] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("lanza error cuando RLS/trigger silencian filas del insert", async () => {
    deleteResp = { data: [], error: null };
    // Solicitamos 2 pero solo se insertó 1 → mismatch
    insertResp = { data: [{ invoice_id: "inv-1" }], error: null };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useSyncInvoiceBookings(), { wrapper: Wrapper });

    result.current.mutate({ invoiceId: "inv-1", bookingIds: ["b-1", "b-2"] });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(String(result.current.error?.message ?? "")).toMatch(/se esperaban 2/);
  });

  it("bookingIds vacío: solo ejecuta delete y termina en éxito", async () => {
    deleteResp = { data: [], error: null };
    insertResp = { data: null, error: { message: "should not be called" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useSyncInvoiceBookings(), { wrapper: Wrapper });

    result.current.mutate({ invoiceId: "inv-1", bookingIds: [] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
