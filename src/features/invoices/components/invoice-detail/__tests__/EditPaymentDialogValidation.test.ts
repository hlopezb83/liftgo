import { describe, it, expect } from "vitest";
import { validateEditPaymentAmount } from "../validateEditPaymentAmount";

/**
 * M3-01: tope BL-11 al editar un pago — el monto nuevo no puede exceder el
 * saldo actual (que ya incluye este pago) más el monto original del pago.
 * Con REP timbrado el servidor rechaza cambios de monto/fecha: la validación
 * de cliente se desactiva (deshabilitados en UI) y siempre pasa.
 */
describe("validateEditPaymentAmount", () => {
  it("monto igual al tope exacto → ok", () => {
    // saldo 1000 + monto original 400 = 1400
    expect(validateEditPaymentAmount(1400, 1000, 400, false)).toEqual({ ok: true });
  });

  it("monto dentro de tolerancia (0.005) → ok", () => {
    expect(validateEditPaymentAmount(1400.005, 1000, 400, false)).toEqual({ ok: true });
  });

  it("monto excede el tope → ok:false con maxAllowed", () => {
    const result = validateEditPaymentAmount(1500, 1000, 400, false);
    expect(result).toEqual({ ok: false, maxAllowed: 1400 });
  });

  it("monto menor al saldo → ok", () => {
    expect(validateEditPaymentAmount(100, 1000, 400, false)).toEqual({ ok: true });
  });

  it("REP timbrado → siempre ok, sin importar el monto", () => {
    expect(validateEditPaymentAmount(999999, 1000, 400, true)).toEqual({ ok: true });
  });
});
