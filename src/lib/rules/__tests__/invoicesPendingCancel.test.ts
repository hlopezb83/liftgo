import { describe, it, expect } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { computeInvoiceFlags } from "../invoices";

/**
 * Fix 8.2 (Sprint 8): una factura con cancelación pendiente ante el SAT no es
 * cobrable — el botón "Registrar pago" se oculta y en su lugar se expone el
 * flag para el tooltip explicativo.
 */
const inv = (partial: Record<string, unknown>): Tables<"invoices"> =>
  ({
    id: "i1",
    status: "sent",
    cfdi_status: "stamped",
    metodo_pago: "PPD",
    total: 1000,
    balance: 1000,
    ...partial,
  }) as unknown as Tables<"invoices">;

describe("computeInvoiceFlags · Fix 8.2 pagos con cancelación SAT pendiente", () => {
  it("factura enviada con cancelación pendiente: sin botón de pago y con motivo del bloqueo", () => {
    const f = computeInvoiceFlags(
      inv({ cancellation_status: "pending", cancellation_motive: "02" }),
      "stamped",
      null,
    );
    expect(f.isPendingCancel).toBe(true);
    expect(f.showPaymentBtn).toBe(false);
    expect(f.paymentBlockedByPendingCancellation).toBe(true);
  });

  it("factura parcial con cancelación pendiente tampoco es cobrable", () => {
    const f = computeInvoiceFlags(
      inv({ status: "partial", balance: 400, cancellation_status: "pending" }),
      "stamped",
      null,
    );
    expect(f.showPaymentBtn).toBe(false);
    expect(f.paymentBlockedByPendingCancellation).toBe(true);
  });

  it("cancelación rechazada por el receptor: vuelve a ser cobrable", () => {
    const f = computeInvoiceFlags(
      inv({ cancellation_status: "rejected", cancellation_motive: "02" }),
      "stamped",
      null,
    );
    expect(f.isPendingCancel).toBe(false);
    expect(f.showPaymentBtn).toBe(true);
    expect(f.paymentBlockedByPendingCancellation).toBe(false);
  });

  it("sin cancelación en curso el bloqueo no se activa", () => {
    const f = computeInvoiceFlags(inv({}), "stamped", null);
    expect(f.showPaymentBtn).toBe(true);
    expect(f.paymentBlockedByPendingCancellation).toBe(false);
  });
});
