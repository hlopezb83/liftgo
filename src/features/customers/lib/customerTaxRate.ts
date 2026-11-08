/**
 * Customer VAT accepted by invoice prefill. Keep the existing Number coercion
 * and nonnegative, finite check, including an explicit zero. Missing/invalid
 * rates return undefined so each caller retains its existing fallback policy.
 */
export function customerTaxRate(value: number | string | null | undefined): number | undefined {
  const rate = Number(value);
  return value != null && Number.isFinite(rate) && rate >= 0 ? rate : undefined;
}
