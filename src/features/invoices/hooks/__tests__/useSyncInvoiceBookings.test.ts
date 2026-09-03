import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock, type SupabaseMockResponse } from "@/test/helpers/supabaseChain";

/**
 * Bug 5 (facturas agrupadas): `useSyncInvoiceBookings` delega en el RPC
 * atómico `sync_invoice_bookings` (delete+insert en UNA transacción con
 * validación de idempotencia reserva+período en el servidor). Estos tests
 * garantizan que:
 *   1. El hook llama al RPC con los parámetros correctos y resuelve.
 *   2. Un error del RPC (p. ej. reserva ya facturada en el mismo período)
 *      se propaga como error de la mutación.
 *   3. `bookingIds = []` también pasa por el RPC (borra vínculos) sin fallar.
 */

let rpcResp: SupabaseMockResponse = { data: 0, error: null };
const rpcCalls: Array<{ name: string; args: unknown }> = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    rpcResolvers: {
      sync_invoice_bookings: (args: unknown) => {
        rpcCalls.push({ name: "sync_invoice_bookings", args });
        return rpcResp;
      },
    },
  }),
}));

import { useSyncInvoiceBookings } from "../invoices/useInvoiceBookings";

describe("useSyncInvoiceBookings — RPC atómico sync_invoice_bookings", () => {
  it("llama al RPC con p_invoice_id/p_booking_ids y resuelve en éxito", async () => {
    rpcResp = { data: 2, error: null };
    rpcCalls.length = 0;
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useSyncInvoiceBookings(), { wrapper: Wrapper });

    result.current.mutate({ invoiceId: "inv-1", bookingIds: ["b-1", "b-2"] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].args).toEqual({ p_invoice_id: "inv-1", p_booking_ids: ["b-1", "b-2"] });
  });

  it("propaga el error del RPC (reserva ya facturada en el mismo período)", async () => {
    rpcResp = {
      data: null,
      error: { message: "La reserva RSV-0001 ya está facturada en FAC-0002 para el período 2026-09-01 – 2026-09-30." },
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useSyncInvoiceBookings(), { wrapper: Wrapper });

    result.current.mutate({ invoiceId: "inv-1", bookingIds: ["b-1"] });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(String(result.current.error?.message ?? "")).toMatch(/ya está facturada/);
  });

  it("bookingIds vacío: el RPC borra vínculos y la mutación termina en éxito", async () => {
    rpcResp = { data: 0, error: null };
    rpcCalls.length = 0;
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useSyncInvoiceBookings(), { wrapper: Wrapper });

    result.current.mutate({ invoiceId: "inv-1", bookingIds: [] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].args).toEqual({ p_invoice_id: "inv-1", p_booking_ids: [] });
  });
});
