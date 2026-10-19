// Decimal text shares Intl's visible currency rounding with screen/PDF.
// A decimal point and no grouping keep the CSV importable and allow the
// depreciation presentation to count the exact same displayed cents.
const formatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
});

export const formatStatementAmount = (amount: number): string => formatter.format(amount);
