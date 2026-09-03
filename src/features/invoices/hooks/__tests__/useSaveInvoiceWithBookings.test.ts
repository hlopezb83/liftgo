import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock, type SupabaseMockResponse } from "@/test/helpers/supabaseChain";

/**
 * Regresión v7.423.0 (P1): el formulario ya no encadena crear/actualizar +
 * sync en dos peticiones. `useSaveInvoiceWithBookings` delega en el RPC
 * transaccional `save_invoice_with_bookings` (factura + pivote en UNA
 * transacción con candados advisory). Estos tests garantizan:
 *   1. Crear: RPC con p_invoice/p_booking_ids (sin id ni versión) y devuelve
 *      la fila guardada.
 *   2. Editar: viajan p_invoice_id y p_expected_version (bloqueo optimista).
 *   3. Un rechazo del RPC (duplicado reserva+período, stale_write, período
 *      fuera de rango) se propaga como error de la mutación — nada persiste
 *      porque el servidor revirtió la transacción completa.
 */

let rpcResp: SupabaseMockResponse = { data: [], error: null };
const rpcCalls: Array<{ name: string; args: unknown }> = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    rpcResolvers: {
      save_invoice_with_bookings: (args: unknown) => {
        rpcCalls.push({ name: "save_invoice_with_bookings", args });
        return rpcResp;
      },
    },
  }),
}));

import { useSaveInvoiceWithBookings } from "../invoices/useInvoices";

const payload = {
  booking_id: "b-1",
  customer_id: "c-1",
  customer_name: "ACME",
  subtotal: 100,
  tax_rate: 16,
  tax_amount: 16,
  total: 116,
  issued_at: "2026-09-01",
  billing_period_start: "2026-09-01",
  billing_period_end: "2026-09-30",
} as unknown as Parameters<ReturnType<typeof useSaveInvoiceWithBookings>["mutate"]>[0]["payload"];

describe("useSaveInvoiceWithBookings — RPC transaccional save_invoice_with_bookings", () => {
  it("crear: llama al RPC con p_invoice/p_booking_ids y devuelve la fila", async () => {
    rpcResp = { data: [{ id: "inv-1", invoice_number: "BORRADOR-0001", version: 1 }], error: null };
    rpcCalls.length = 0;
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useSaveInvoiceWithBookings(), { wrapper: Wrapper });

    result.current.mutate({ payload, bookingIds: ["b-1", "b-2"] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].args).toEqual({
      p_invoice: payload,
      p_booking_ids: ["b-1", "b-2"],
      p_invoice_id: undefined,
      p_expected_version: undefined,
    });
    expect(result.current.data?.id).toBe("inv-1");
    expect(result.current.data?.invoice_number).toBe("BORRADOR-0001");
  });

  it("editar: viajan p_invoice_id y p_expected_version (bloqueo optimista)", async () => {
    rpcResp = { data: [{ id: "inv-7", invoice_number: "FAC-0100", version: 4 }], error: null };
    rpcCalls.length = 0;
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useSaveInvoiceWithBookings(), { wrapper: Wrapper });

    result.current.mutate({ payload, bookingIds: ["b-1"], invoiceId: "inv-7", expectedVersion: 3 });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(rpcCalls[0].args).toEqual({
      p_invoice: payload,
      p_booking_ids: ["b-1"],
      p_invoice_id: "inv-7",
      p_expected_version: 3,
    });
  });

  it("propaga el rechazo del RPC (reserva ya facturada en el mismo período)", async () => {
    rpcResp = {
      data: null,
      error: { message: "La reserva RSV-0001 ya está facturada en FAC-0002 para el período 2026-09-01 – 2026-09-30." },
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useSaveInvoiceWithBookings(), { wrapper: Wrapper });

    result.current.mutate({ payload, bookingIds: ["b-1"] });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(String(result.current.error?.message ?? "")).toMatch(/ya está facturada/);
  });

  it("propaga stale_write del RPC (conflicto de concurrencia en edición)", async () => {
    rpcResp = {
      data: null,
      error: { message: "stale_write: otro usuario modificó esta factura; recarga y vuelve a intentar" },
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useSaveInvoiceWithBookings(), { wrapper: Wrapper });

    result.current.mutate({ payload, bookingIds: [], invoiceId: "inv-7", expectedVersion: 2 });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(String(result.current.error?.message ?? "")).toMatch(/stale_write/);
  });

  it("bookingIds vacío: RPC borra vínculos y la mutación termina en éxito", async () => {
    rpcResp = { data: [{ id: "inv-9", invoice_number: "BORRADOR-0002", version: 1 }], error: null };
    rpcCalls.length = 0;
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useSaveInvoiceWithBookings(), { wrapper: Wrapper });

    result.current.mutate({ payload, bookingIds: [] });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect((rpcCalls[0].args as { p_booking_ids: string[] }).p_booking_ids).toEqual([]);
  });
});
