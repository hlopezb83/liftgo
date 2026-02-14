/**
 * Format a number as EUR currency.
 * Example: formatCurrency(1234.5) → "€1,234.50"
 */
export function formatCurrency(amount: number): string {
  return `€${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
