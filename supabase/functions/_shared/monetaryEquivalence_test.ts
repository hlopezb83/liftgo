import {
  assertEquals,
  assertMatch,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  conversionCases,
  creditCases,
  documentCases,
  fractionalTaxDiscrepancy,
  missingRateCases,
} from "../../../tests/fixtures/monetaryEquivalence.ts";
import {
  recurringChargeAmounts,
  type RecurringQuoteCharge,
} from "../generate-recurring-invoices/quoteCharges.ts";
import { validateCreditNoteSourceLines } from "./creditNoteSourceValidation.ts";
import { creditNoteDiscountForSelection } from "./creditNoteDiscount.ts";
import { computeRepExchange } from "../stamp-payment-complement/decisions.ts";
import { roundMoney } from "./money.ts";
import { assertStampFxOrThrow, checkStampFx } from "./fxGate.ts";

for (const c of documentCases) {
  Deno.test(`MEJ-005 ${c.id}: actual recurring charge calculator`, () => {
    const amounts = c.lines.map((line) =>
      recurringChargeAmounts({
        ...line,
        total: roundMoney(roundMoney(line.unit_price) * line.quantity),
      } as RecurringQuoteCharge, c.taxRate)
    );
    assertEquals({
      subtotal: amounts.reduce((s, l) => s + l.netCents, 0) / 100,
      taxAmount: amounts.reduce((s, l) => s + l.taxCents, 0) / 100,
      total: amounts.reduce((s, l) => s + l.netCents + l.taxCents, 0) / 100,
    }, c.expected);
  });
}
for (const c of creditCases) {
  Deno.test(`MEJ-005 ${c.id}: actual source-bound credit validation`, () => {
    assertEquals(
      creditNoteDiscountForSelection({
        originalGross: roundMoney(
          roundMoney(c.source.unit_price) * c.source.quantity,
        ),
        selectedGross: roundMoney(
          roundMoney(c.source.unit_price) * c.selectedQuantity,
        ),
        originalDiscount: c.source.discount,
        discountType: c.source.discount_type,
      }),
      c.allocatedDiscount,
    );
    const result = validateCreditNoteSourceLines({
      line_items: [{
        ...c.source,
        quantity: c.selectedQuantity,
        source_line_index: 0,
      }],
      subtotal: c.expected.subtotal,
      tax_amount: c.expected.taxAmount,
      total: c.expected.total,
    }, { tax_rate: c.taxRate, line_items: [c.source] });
    assertEquals(result.ok, true);
    if (result.ok) {
      assertEquals({
        subtotal: result.subtotal,
        taxAmount: result.taxAmount,
        total: result.total,
      }, c.expected);
    }
  });
}
for (const rate of missingRateCases) {
  Deno.test(`MEJ-005 missing USD rate ${rate}: explicit Edge error`, () => {
    const result = checkStampFx("USD", rate);
    assertEquals(result.ok, false);
    assertMatch(result.message!, /tipo de cambio válido/);
    assertThrows(
      () => assertStampFxOrThrow("USD", rate),
      Error,
      "tipo de cambio válido",
    );
    assertEquals(checkStampFx("MXN", rate).ok, true);
  });
}
Deno.test("MEJ005-D1: Edge fractional-tax decimal contract", () => {
  const c = fractionalTaxDiscrepancy;
  assertEquals(
    recurringChargeAmounts(
      { ...c.line, total: 0.03 } as RecurringQuoteCharge,
      c.taxRate,
    ),
    { netCents: 3, taxCents: 0 },
  );
  const result = validateCreditNoteSourceLines({
    subtotal: c.expected.subtotal,
    tax_amount: c.expected.taxAmount,
    total: c.expected.total,
    line_items: [{ ...c.line, source_line_index: 0 }],
  }, { tax_rate: c.taxRate, line_items: [c.line] });
  assertEquals(result.ok, true);
});

// REP has a narrower contract than accounting conversion: two different foreign
// currencies are deliberately rejected. These exercise decisions, never issue REP.
for (const c of conversionCases) {
  Deno.test(`MEJ-005 ${c.id}: Edge REP exchange decision`, () => {
    const input = {
      paymentCurrency: c.from,
      invoiceCurrency: c.to,
      paymentExchangeRate: c.fromRate,
      invoiceTipoCambio: c.toRate,
    };
    if (c.from !== "MXN" && c.to !== "MXN" && c.from !== c.to) {
      assertThrows(
        () => computeRepExchange(input),
        Error,
        "dos monedas extranjeras distintas",
      );
    } else {
      assertEquals(computeRepExchange(input), {
        invoiceCurrency: c.to,
        invoiceExchange: c.from === c.to
          ? 1
          : c.from === "MXN"
          ? c.toRate
          : c.fromRate,
      });
    }
  });
}
