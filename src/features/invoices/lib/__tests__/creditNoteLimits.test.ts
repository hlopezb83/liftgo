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
        cn({ id: "b", total: 100, status: "draft", cfdi_status: undefined }),
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


describe("BF02: non-REP payment currency controls", () => {
  it.each([
    { invoice: "MXN", rate: 1, payment: "USD", paymentRate: 20, amount: 50, expected: 1000 },
    { invoice: "USD", rate: 20, payment: "MXN", paymentRate: 1, amount: 1000, expected: 50 },
    { invoice: "EUR", rate: 25, payment: "USD", paymentRate: 20, amount: 50, expected: 40 },
    { invoice: "USD", rate: null, payment: "USD", paymentRate: null, amount: 50, expected: 50 },
    { invoice: "USD", rate: null, payment: null, paymentRate: null, amount: 50, expected: 50 },
  ])("converts $payment to invoice $invoice without changing the credit cap", (fixture) => {
    const r = computeCreditNoteLimits(2000, [], [pay({ amount: fixture.amount,
      currency: fixture.payment ?? undefined, exchange_rate: fixture.paymentRate ?? undefined })],
    { moneda: fixture.invoice, tipo_cambio: fixture.rate });
    expect(r.otherPaid).toBe(fixture.expected);
    expect(r.fxMissingOtherPayments).toBe(0);
    expect(r.maxCreditable).toBe(2000);
    expect(r.willCreateCredit).toBe(true);
  });

  it("reports unknown conversion without presenting a partial sum as total or changing the REP cap", () => {
    const r = computeCreditNoteLimits(2000, [], [
      pay({ amount: 50, currency: "USD", exchange_rate: undefined }),
      pay({ amount: 100, currency: "MXN" }),
    ], { moneda: "MXN" });
    expect(r.otherPaid).toBe(100);
    expect(r.fxMissingOtherPayments).toBe(1);
    expect(r.willCreateCredit).toBe(false);
    expect(r.blockedByMissingFx).toBe(false);
    expect(r.maxCreditable).toBe(2000);
  });

  it("converts a cancelled REP as a non-REP payment, but keeps active REP fail-closed", () => {
    const r = computeCreditNoteLimits(2000, [], [
      pay({ amount: 50, currency: "USD", exchange_rate: 20, rep_cfdi_status: "stamped", rep_cancelled_at: "2026-10-20" }),
      pay({ amount: 10, currency: "USD", exchange_rate: undefined, rep_cfdi_status: "stamped" }),
    ], { moneda: "MXN" });
    expect(r.otherPaid).toBe(1000);
    expect(r.fxMissingReps).toBe(1);
    expect(r.blockedByMissingFx).toBe(true);
  });
});
