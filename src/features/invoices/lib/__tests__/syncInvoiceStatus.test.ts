import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createSupabaseChainMock,
  type ChainResolver,
} from "@/test/helpers/supabaseChain";

interface State {
  payments: { amount: number; payment_date?: string }[];
  invoice: { total: number; status: string } | null;
  updateError: { code?: string; message: string } | null;
  capturedUpdate: Record<string, unknown> | null;
}

const state: State = {
  payments: [],
  invoice: null,
  updateError: null,
  capturedUpdate: null,
};

const invoicesResolver: ChainResolver = (calls) => {
  const updateCall = calls.find((c) => c.method === "update");
  if (updateCall) {
    state.capturedUpdate = (updateCall.args[0] ?? {}) as Record<string, unknown>;
    if (state.updateError) return { data: null, error: state.updateError };
    return { data: [{ id: "inv-1" }], error: null };
  }
  // read
  return { data: state.invoice, error: null };
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      payments: () => ({ data: state.payments, error: null }),
      invoices: invoicesResolver,
    },
  }),
}));

import { syncInvoiceStatus } from "../syncInvoiceStatus";

describe("syncInvoiceStatus", () => {
  beforeEach(() => {
    state.payments = [];
    state.invoice = null;
    state.updateError = null;
    state.capturedUpdate = null;
  });

  it("marca paid cuando los pagos cubren el total", async () => {
    state.payments = [{ amount: 1160, payment_date: "2026-03-01" }];
    state.invoice = { total: 1160, status: "sent" };
    await syncInvoiceStatus("inv-1", null);
    expect(state.capturedUpdate).toMatchObject({ status: "paid" });
    expect(state.capturedUpdate?.paid_at).toBe("2026-03-01");
  });

  it("marca partial cuando hay pago pero queda saldo", async () => {
    state.payments = [{ amount: 500, payment_date: "2026-03-01" }];
    state.invoice = { total: 1160, status: "sent" };
    await syncInvoiceStatus("inv-1", null);
    expect(state.capturedUpdate).toMatchObject({ status: "partial", paid_at: null });
  });

  it("restablece a sent cuando no hay pagos y estado actual es paid", async () => {
    state.payments = [];
    state.invoice = { total: 1160, status: "paid" };
    await syncInvoiceStatus("inv-1", null);
    expect(state.capturedUpdate).toMatchObject({ status: "sent", paid_at: null });
  });

  it("no actualiza si el estado ya coincide", async () => {
    state.payments = [];
    state.invoice = { total: 1160, status: "sent" };
    await syncInvoiceStatus("inv-1", null);
    expect(state.capturedUpdate).toBeNull();
  });

  it("salida temprana si la factura no existe", async () => {
    state.payments = [];
    state.invoice = null;
    await syncInvoiceStatus("inv-x", null);
    expect(state.capturedUpdate).toBeNull();
  });
});
