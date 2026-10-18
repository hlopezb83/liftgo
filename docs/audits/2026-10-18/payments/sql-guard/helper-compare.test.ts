import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sumPaymentsInInvoiceCurrency, type PaymentLike } from "@/features/invoices/lib/paymentCurrency";
import { validateEditPaymentAmount } from "@/features/invoices/components/invoice-detail/validateEditPaymentAmount";

type Observation = {
  invoice: { moneda: string; tipo_cambio: number; paid_amount: number; balance: number; status: string };
  payments: PaymentLike[];
};
const result = JSON.parse(readFileSync(new URL("./fixture-results.json", import.meta.url), "utf8")) as {
  observations: Record<string, Observation>;
  assertions: Array<{ case_id: string; actual_state: string; expected_state: string }>;
  local_guard_definition: string;
  local_rep_guard_definition: string;
};
const snapshot = JSON.parse(readFileSync(new URL("../server-guard/remote-current-payment-guards.json", import.meta.url), "utf8"));
const state = (name: string) => result.assertions.find((entry) => entry.case_id === name)?.actual_state;
const mxnOnUsd = { invoiceCurrency: "USD", invoiceExchangeRate: 17.5, paymentCurrency: "MXN" };
const normalized = (source: string) => source.trim().replace(/;$/, "").trim();

describe("ephemeral SQL guard evidence versus actual product helpers", () => {
  for (const [name, observation] of Object.entries(result.observations)) {
    it(`canonical view projection and actual helper agree: ${name}`, () => {
      expect(sumPaymentsInInvoiceCurrency(observation.payments, observation.invoice.moneda, observation.invoice.tipo_cambio))
        .toEqual({ totalPaid: observation.invoice.paid_amount, unconvertible: 0 });
    });
  }

  it("loaded SQL guard and REP mutation function equal the parent's current catalog snapshot", () => {
    const functions = snapshot.result.rows[0].metadata.functions as Array<{ name: string; definition: string }>;
    expect(normalized(result.local_guard_definition))
      .toBe(normalized(functions.find((entry) => entry.name === "enforce_payment_within_invoice_total")!.definition));
    expect(normalized(result.local_rep_guard_definition))
      .toBe(normalized(functions.find((entry) => entry.name === "prevent_payment_mutation_when_rep_stamped")!.definition));
    expect(result.assertions).toHaveLength(29);
    expect(result.assertions.every((entry) => entry.actual_state === entry.expected_state)).toBe(true);
  });

  it("N8 frontend permits 350 but server differs for the historical default-1 variant", () => {
    for (const paymentExchangeRate of [1, 17.5, 18]) {
      expect(validateEditPaymentAmount(350, 90, 175, false, { ...mxnOnUsd, paymentExchangeRate })).toEqual({ ok: true });
    }
    expect(state("N8_edit350_legacy_default1")).toBe("23514");
    expect(state("N8_edit350_rate17_5")).toBe("00000");
    expect(state("N8_edit350_rate18")).toBe("00000");
  });

  it("canonical cents and client tolerance do not imply the raw server guard accepts an extra MXN .02", () => {
    expect(validateEditPaymentAmount(1750.02, 90, 175, false, { ...mxnOnUsd, paymentExchangeRate: 17.5 })).toEqual({ ok: true });
    expect(state("N8_exact1750_rate17_5")).toBe("00000");
    expect(state("N8_extra002_rate17_5")).toBe("23514");
    expect(state("N8_extra026_rate17_5")).toBe("23514");
  });

  it("TC 18 can permit server payment above the canonical invoice balance while frontend rejects it", () => {
    expect(validateEditPaymentAmount(1800, 90, 175, false, { ...mxnOnUsd, paymentExchangeRate: 18 }))
      .toEqual({ ok: false, maxAllowed: 1750 });
    expect(state("N8_edit1800_rate18")).toBe("00000");
    expect(result.observations.N8_rate18_canonical_overpayment.invoice.paid_amount).toBe(102.86);
  });

  it("rounding status mismatch remains a distinct server observation", () => {
    const invoice = result.observations.N7_rounding_status_boundary.invoice;
    expect(invoice.balance).toBe(0);
    expect(invoice.paid_amount).toBe(0.12);
    expect(invoice.status).toBe("partial");
  });

  it("REP stamped SQL guards rejected fiscal changes and deletion while allowing notes", () => {
    expect(state("REP_stamped_amount_change")).toBe("23514");
    expect(state("REP_stamped_delete_blocked")).toBe("23514");
    expect(state("REP_stamped_notes_allowed")).toBe("00000");
  });
});
