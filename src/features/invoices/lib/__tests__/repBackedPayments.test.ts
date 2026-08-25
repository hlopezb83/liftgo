import { describe, expect, it } from "vitest";
import { isRepBacked, repBackedPayments, sumRepBackedPayments } from "../repBackedPayments";

const pago = (over: Partial<Parameters<typeof isRepBacked>[0]> = {}) => ({
  id: "p1",
  amount: 100,
  rep_cfdi_status: null as string | null,
  rep_cancelled_at: null as string | null,
  ...over,
});

describe("repBackedPayments (H-5)", () => {
  it("pago sin REP timbrado no está respaldado", () => {
    expect(isRepBacked(pago())).toBe(false);
    expect(isRepBacked(pago({ rep_cfdi_status: "error" }))).toBe(false);
  });

  it("pago con REP timbrado y vigente sí está respaldado", () => {
    expect(isRepBacked(pago({ rep_cfdi_status: "stamped" }))).toBe(true);
  });

  it("REP cancelado deja de topar", () => {
    expect(
      isRepBacked(pago({ rep_cfdi_status: "stamped", rep_cancelled_at: "2026-08-01T00:00:00Z" })),
    ).toBe(false);
  });

  it("suma sólo los pagos con REP vigente, sin drift", () => {
    const total = sumRepBackedPayments([
      pago({ id: "a", amount: 10.1, rep_cfdi_status: "stamped" }),
      pago({ id: "b", amount: 20.2, rep_cfdi_status: "stamped" }),
      pago({ id: "c", amount: 999 }),
      pago({ id: "d", amount: 500, rep_cfdi_status: "stamped", rep_cancelled_at: "2026-08-01T00:00:00Z" }),
    ]);
    expect(total).toBe(30.3);
  });

  it("lista los pagos que hay que cancelar antes de acreditar de más", () => {
    const items = repBackedPayments([
      pago({ id: "a", rep_cfdi_status: "stamped" }),
      pago({ id: "b" }),
    ]);
    expect(items.map((p) => p.id)).toEqual(["a"]);
  });

  it("importe nulo o no numérico cuenta como cero", () => {
    expect(sumRepBackedPayments([pago({ amount: null, rep_cfdi_status: "stamped" })])).toBe(0);
  });
});
