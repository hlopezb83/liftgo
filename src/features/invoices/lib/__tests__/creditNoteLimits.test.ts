import { describe, it, expect } from "vitest";
import { computeCreditNoteLimits } from "../creditNoteLimits";
import type { CreditNote } from "../../hooks/creditNotes/useCreditNotes";
import type { Payment } from "../../hooks/usePayments";

const cn = (over: Partial<CreditNote>): CreditNote =>
  ({
    id: "cn", total: 0, status: "stamped", cfdi_status: "stamped",
    cancellation_status: null, ...over,
  }) as unknown as CreditNote;

const pay = (over: Partial<Payment>): Payment =>
  ({
    id: "p", amount: 0, rep_cfdi_status: null, rep_cancelled_at: null, ...over,
  }) as unknown as Payment;

describe("computeCreditNoteLimits", () => {
  it("sin NCs ni pagos, el tope es el total de la factura", () => {
    const r = computeCreditNoteLimits(11600, [], []);
    expect(r.maxCreditable).toBe(11600);
    expect(r.blockedByReps).toBe(false);
    expect(r.willCreateCredit).toBe(false);
  });

  it("resta NCs timbradas vigentes y borradores", () => {
    const r = computeCreditNoteLimits(
      1000,
      [
        cn({ id: "a", total: 200 }),
        cn({ id: "b", total: 100, status: "draft", cfdi_status: null }),
        cn({ id: "c", total: 500, cancellation_status: "accepted" }),
      ],
      [],
    );
    expect(r.activeCredits).toBe(200);
    expect(r.draftCredits).toBe(100);
    expect(r.maxCreditable).toBe(700);
  });

  it("los pagos con REP timbrado topan la NC y pueden bloquearla", () => {
    const r = computeCreditNoteLimits(
      1000,
      [],
      [pay({ id: "p1", amount: 1000, rep_cfdi_status: "stamped" })],
    );
    expect(r.repBacked).toBe(1000);
    expect(r.repPayments).toHaveLength(1);
    expect(r.maxCreditable).toBe(0);
    expect(r.blockedByReps).toBe(true);
  });

  it("los pagos sin REP generan saldo a favor, no bloqueo", () => {
    const r = computeCreditNoteLimits(1000, [], [pay({ id: "p2", amount: 400 })]);
    expect(r.otherPaid).toBe(400);
    expect(r.repBacked).toBe(0);
    expect(r.maxCreditable).toBe(1000);
    expect(r.willCreateCredit).toBe(true);
  });
});
