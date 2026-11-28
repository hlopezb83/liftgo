import { describe, it, expect } from "vitest";

/**
 * Réplica TS pura del trigger `set_supplier_payment_rep_required`
 * (supabase/migrations/20260609042629_*.sql) para validar la lógica
 * de marcado de REP requerido al insertar/actualizar supplier_payments.
 *
 * Mantener esta función alineada con el SQL del trigger. Si el trigger cambia,
 * actualizar este helper y agregar/ajustar casos.
 */
type RepStatus = "not_required" | "pending" | "received" | "rejected";

interface SupplierPaymentRow {
  rep_required: boolean | null;
  rep_status: RepStatus | null;
}

export function applyRepTrigger(
  payment: SupplierPaymentRow,
  billPaymentMethodSat: string | null,
): SupplierPaymentRow {
  const out = { ...payment };
  if (billPaymentMethodSat === "PPD") {
    out.rep_required = true;
    if (out.rep_status == null || out.rep_status === "not_required") {
      out.rep_status = "pending";
    }
  } else {
    out.rep_required = false;
    out.rep_status = "not_required";
  }
  return out;
}

describe("set_supplier_payment_rep_required (trigger TS replica)", () => {
  it("factura PPD + status nulo → rep_required + pending", () => {
    const r = applyRepTrigger({ rep_required: null, rep_status: null }, "PPD");
    expect(r.rep_required).toBe(true);
    expect(r.rep_status).toBe("pending");
  });

  it("factura PPD + status received → conserva received", () => {
    const r = applyRepTrigger(
      { rep_required: true, rep_status: "received" },
      "PPD",
    );
    expect(r.rep_required).toBe(true);
    expect(r.rep_status).toBe("received");
  });

  it("factura PPD + status rejected → conserva rejected", () => {
    const r = applyRepTrigger(
      { rep_required: true, rep_status: "rejected" },
      "PPD",
    );
    expect(r.rep_status).toBe("rejected");
  });

  it("factura PUE → fuerza not_required", () => {
    const r = applyRepTrigger(
      { rep_required: true, rep_status: "pending" },
      "PUE",
    );
    expect(r.rep_required).toBe(false);
    expect(r.rep_status).toBe("not_required");
  });

  it("factura sin método SAT (nulo) → fuerza not_required", () => {
    const r = applyRepTrigger({ rep_required: null, rep_status: null }, null);
    expect(r.rep_required).toBe(false);
    expect(r.rep_status).toBe("not_required");
  });
});
