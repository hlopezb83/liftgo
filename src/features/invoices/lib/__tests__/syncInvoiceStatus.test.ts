import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createSupabaseChainMock,
  type ChainCall,
  type SupabaseMockResponse,
} from "@/test/helpers/supabaseChain";

interface PaymentRow {
  amount: number;
  payment_date?: string;
}
interface InvoiceRow {
  total: number;
  status: string;
}

let paymentsListResp: PaymentRow[] = [];
let invoiceRow: InvoiceRow | null = { total: 1000, status: "sent" };
let invoiceUpdateResp: SupabaseMockResponse = { data: [{ id: "inv-1" }], error: null };

const paymentsCalls: ChainCall[] = [];
const invoicesCalls: ChainCall[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      payments: (calls) => {
        paymentsCalls.push(...calls);
        return { data: paymentsListResp, error: null };
      },
      invoices: (calls) => {
        invoicesCalls.push(...calls);
        if (calls.some((c) => c.method === "update")) return invoiceUpdateResp;
        return { data: invoiceRow, error: null };
      },
    },
  }),
}));

import { syncInvoiceStatus } from "@/features/invoices/lib/syncInvoiceStatus";

describe("syncInvoiceStatus", () => {
  beforeEach(() => {
    paymentsListResp = [];
    invoiceRow = { total: 1000, status: "sent" };
    invoiceUpdateResp = { data: [{ id: "inv-1" }], error: null };
    paymentsCalls.length = 0;
    invoicesCalls.length = 0;
  });

  it("pagos == total → paid con paid_at = max(payment_date)", async () => {
    paymentsListResp = [
      { amount: 500, payment_date: "2026-03-01" },
      { amount: 500, payment_date: "2026-03-05" },
    ];
    await syncInvoiceStatus("inv-1", null);
    const upd = invoicesCalls.find((c) => c.method === "update");
    expect(upd?.args[0]).toMatchObject({ status: "paid", paid_at: "2026-03-05" });
  });

  it("pagos < total → partial sin paid_at", async () => {
    paymentsListResp = [{ amount: 300, payment_date: "2026-03-01" }];
    await syncInvoiceStatus("inv-1", null);
    const upd = invoicesCalls.find((c) => c.method === "update");
    expect(upd?.args[0]).toMatchObject({ status: "partial", paid_at: null });
  });

  it("sin pagos y status != sent → resetea a sent", async () => {
    paymentsListResp = [];
    invoiceRow = { total: 1000, status: "partial" };
    await syncInvoiceStatus("inv-1", null);
    const upd = invoicesCalls.find((c) => c.method === "update");
    expect(upd?.args[0]).toMatchObject({ status: "sent", paid_at: null });
  });

  it("pagos == total y payment_date ausente → usa fallback recibido", async () => {
    paymentsListResp = [{ amount: 1_000 }];
    await syncInvoiceStatus("inv-1", "2026-04-10");
    const upd = invoicesCalls.find((c) => c.method === "update");
    expect(upd?.args[0]).toMatchObject({ status: "paid", paid_at: "2026-04-10" });
  });

  it("invoice no existe → no lanza ni hace UPDATE", async () => {
    invoiceRow = null;
    await expect(syncInvoiceStatus("inv-1", null)).resolves.toBeUndefined();
    expect(invoicesCalls.find((c) => c.method === "update")).toBeUndefined();
  });

  it("idempotencia: factura ya está en el status correcto → no hace UPDATE", async () => {
    paymentsListResp = [{ amount: 1_000, payment_date: "2026-03-01" }];
    invoiceRow = { total: 1_000, status: "paid" };
    await syncInvoiceStatus("inv-1", null);
    expect(invoicesCalls.find((c) => c.method === "update")).toBeUndefined();
  });

  it("idempotencia: parcial ya parcial → no hace UPDATE", async () => {
    paymentsListResp = [{ amount: 300, payment_date: "2026-03-01" }];
    invoiceRow = { total: 1_000, status: "partial" };
    await syncInvoiceStatus("inv-1", null);
    expect(invoicesCalls.find((c) => c.method === "update")).toBeUndefined();
  });
});
