/** MEJ-005: shared DATA, not a fourth implementation of monetary arithmetic.
 * Expected values are reviewed decimal/cents examples. Never derive expectations
 * from the UI/Edge implementation under test. No customer/provider identifiers.
 */
export type MonetaryLine = {
  description: string; quantity: number; unit_price: number;
  discount?: number; discount_type?: "%" | "$"; tax_rate?: number; objeto_imp?: string;
};
export type Totals = { subtotal: number; taxAmount: number; total: number };
export type DocumentCase = {
  id: string; currency: string; taxRate: number; lines: MonetaryLine[]; expected: Totals;
};
export const documentCases: DocumentCase[] = [
  {
    id: "positive-half-cents-per-line", currency: "MXN", taxRate: 16,
    lines: [1.005, 2.005, 3.005].map((unit_price) => ({ description: "Half cent", quantity: 1, unit_price })),
    expected: { subtotal: 6.03, taxAmount: 0.96, total: 6.99 },
  },
  {
    id: "fractional-percentage-discount", currency: "USD", taxRate: 16,
    lines: [{ description: "Fractional discount", quantity: 2, unit_price: 1000.99, discount: 0.5, discount_type: "%" }],
    expected: { subtotal: 1991.97, taxAmount: 318.72, total: 2310.69 },
  },
  {
    id: "COT0020-GUI-control-not-XML", currency: "MXN", taxRate: 16,
    lines: [{ description: "Synthetic COT0020 control", quantity: 2, unit_price: 50, discount: 10, discount_type: "$" }],
    expected: { subtotal: 90, taxAmount: 14.4, total: 104.4 },
  },
  {
    id: "VAT-rounds-each-line-not-aggregate", currency: "MXN", taxRate: 16,
    lines: Array.from({ length: 10 }, () => ({ description: "Line VAT", quantity: 1, unit_price: 333.33 })),
    expected: { subtotal: 3333.3, taxAmount: 533.3, total: 3866.6 },
  },
  {
    id: "mixed-tax-objects-and-rates", currency: "EUR", taxRate: 16,
    lines: [
      { description: "Standard", quantity: 1, unit_price: 100 },
      { description: "Border", quantity: 1, unit_price: 100, tax_rate: 8 },
      { description: "Non-taxable", quantity: 1, unit_price: 100, objeto_imp: "01" },
      { description: "Zero", quantity: 1, unit_price: 100, tax_rate: 0 },
    ],
    expected: { subtotal: 400, taxAmount: 24, total: 424 },
  },
];
export const creditCases: Array<{
  id: string; currency: string; taxRate: number; source: MonetaryLine;
  selectedQuantity: number; allocatedDiscount: number; expected: Totals;
}> = [
  { id: "COT0020-half-NC-GUI-not-XML", currency: "MXN", taxRate: 16,
    source: documentCases[2].lines[0], selectedQuantity: 1, allocatedDiscount: 5,
    expected: { subtotal: 45, taxAmount: 7.2, total: 52.2 } },
  { id: "fixed-discount-one-third", currency: "USD", taxRate: 16,
    source: { description: "Third of fixed discount", quantity: 3, unit_price: 333, discount: 100, discount_type: "$" },
    selectedQuantity: 1, allocatedDiscount: 33.33,
    expected: { subtotal: 299.67, taxAmount: 47.95, total: 347.62 } },
  { id: "fractional-percentage-partial-NC", currency: "EUR", taxRate: 16,
    source: documentCases[1].lines[0], selectedQuantity: 1, allocatedDiscount: 0.5,
    expected: { subtotal: 995.99, taxAmount: 159.36, total: 1155.35 } },
];
export const conversionCases = [
  { id: "MXN-to-USD-per-payment", amount: 1, from: "MXN", to: "USD", fromRate: 1, toRate: 17.5, expected: 0.06 },
  { id: "USD-to-MXN", amount: 104.4, from: "USD", to: "MXN", fromRate: 17.5, toRate: 1, expected: 1827 },
  { id: "quotient-below-half-cent", amount: 43750.09, from: "MXN", to: "USD", fromRate: 1, toRate: 17.500001, expected: 2500 },
  { id: "USD-to-EUR-accounting-only", amount: 1.01, from: "USD", to: "EUR", fromRate: 17.5, toRate: 20, expected: 0.88 },
  { id: "positive-half-cent-FX", amount: 0.005, from: "MXN", to: "MXN", fromRate: 1, toRate: 1, expected: 0.01 },
  { id: "negative-half-cent-FX", amount: -0.005, from: "MXN", to: "MXN", fromRate: 1, toRate: 1, expected: -0.01 },
];
export const missingRateCases = [null, 0, 1, -1];
export const mixedPayments = {
  currency: "USD", rate: 17.5,
  payments: [
    { amount: 1, currency: "MXN", exchange_rate: 1 },
    { amount: 1, currency: "MXN", exchange_rate: 1 },
    { amount: 1, currency: "USD", exchange_rate: 17.5 },
  ],
  expected: 1.12,
};
// Open product discrepancy, not a new approved tax rule. The acceptance test stays RED:
// UI rounds twice, while Edge/SQL numeric round once. No production fix here.
export const fractionalTaxDiscrepancy = {
  id: "MEJ005-D1-fractional-tax-double-rounding", taxRate: 16.5,
  line: { description: "Fractional tax boundary", quantity: 1, unit_price: 0.03 },
  expected: { subtotal: 0.03, taxAmount: 0, total: 0.03 },
};
