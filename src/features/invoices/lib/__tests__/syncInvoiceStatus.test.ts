import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createSupabaseChainMock,
  type ChainResolver,
} from "@/test/helpers/supabaseChain";

const h = vi.hoisted(() => {
  const state = {
    payments: [] as { amount: number; payment_date?: string }[],
    invoice: null as { total: number; status: string } | null,
    updateError: null as { code?: string; message: string } | null,
    capturedUpdate: null as Record<string, unknown> | null,
  };
  const invoicesResolver = (calls: { method: string; args: unknown[] }[]) => {
    const updateCall = calls.find((c) => c.method === "update");
    if (updateCall) {
      state.capturedUpdate = (updateCall.args[0] ?? {}) as Record<string, unknown>;
      if (state.updateError) return { data: null, error: state.updateError };
      return { data: [{ id: "inv-1" }], error: null };
    }
    return { data: state.invoice, error: null };
  };
  return { state, invoicesResolver };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      payments: () => ({ data: h.state.payments, error: null }),
      invoices: h.invoicesResolver as ChainResolver,
    },
  }),
}));

import { syncInvoiceStatus } from "../syncInvoiceStatus";

describe("syncInvoiceStatus", () => {
  beforeEach(() => {
    h.state.payments = [];
    h.state.invoice = null;
    h.state.updateError = null;
    h.state.capturedUpdate = null;
  });

  it("marca paid cuando los pagos cubren el total", async () => {
    h.state.payments = [{ amount: 1160, payment_date: "2026-03-01" }];
    h.state.invoice = { total: 1160, status: "sent" };
    await syncInvoiceStatus("inv-1", null);
    expect(h.state.capturedUpdate).toMatchObject({ status: "paid" });
    expect(h.state.capturedUpdate?.paid_at).toBe("2026-03-01");
  });

  it("marca partial cuando hay pago pero queda saldo", async () => {
    h.state.payments = [{ amount: 500, payment_date: "2026-03-01" }];
    h.state.invoice = { total: 1160, status: "sent" };
    await syncInvoiceStatus("inv-1", null);
    expect(h.state.capturedUpdate).toMatchObject({ status: "partial", paid_at: null });
  });

  it("restablece a sent cuando no hay pagos y estado actual es paid", async () => {
    h.state.payments = [];
    h.state.invoice = { total: 1160, status: "paid" };
    await syncInvoiceStatus("inv-1", null);
    expect(h.state.capturedUpdate).toMatchObject({ status: "sent", paid_at: null });
  });

  it("no actualiza si el estado ya coincide", async () => {
    h.state.payments = [];
    h.state.invoice = { total: 1160, status: "sent" };
    await syncInvoiceStatus("inv-1", null);
    expect(h.state.capturedUpdate).toBeNull();
  });

  it("salida temprana si la factura no existe", async () => {
    h.state.payments = [];
    h.state.invoice = null;
    await syncInvoiceStatus("inv-x", null);
    expect(h.state.capturedUpdate).toBeNull();
  });

  // BL-10: no resucitar facturas canceladas ni tocar borradores.
  it("no toca facturas canceladas aunque haya pagos", async () => {
    h.state.payments = [{ amount: 1160, payment_date: "2026-03-01" }];
    h.state.invoice = { total: 1160, status: "cancelled" };
    await syncInvoiceStatus("inv-1", null);
    expect(h.state.capturedUpdate).toBeNull();
  });

  it("no toca facturas en borrador aunque haya pagos", async () => {
    h.state.payments = [{ amount: 500, payment_date: "2026-03-01" }];
    h.state.invoice = { total: 1160, status: "draft" };
    await syncInvoiceStatus("inv-1", null);
    expect(h.state.capturedUpdate).toBeNull();
  });
});
