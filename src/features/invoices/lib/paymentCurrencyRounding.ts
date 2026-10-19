type Decimal = { numerator: bigint; denominator: bigint };

/** Read decimal/scientific API numbers as decimal values, without binary math. */
function decimal(value: number | string): Decimal | null {
  const parts = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(String(value).trim());
  if (!parts || !(parts[2] || parts[3])) return null;
  const exponent = Number(parts[4] ?? 0) - (parts[3]?.length ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 400) return null;
  const digits = BigInt((parts[2] || "0") + (parts[3] ?? ""));
  const factor = 10n ** BigInt(Math.abs(exponent));
  return {
    numerator: (parts[1] === "-" ? -digits : digits) * (exponent > 0 ? factor : 1n),
    denominator: exponent < 0 ? factor : 1n,
  };
}

function roundedQuotient(numerator: bigint, denominator: bigint): number | null {
  const magnitude = numerator < 0n ? -numerator : numerator;
  const cents = magnitude / denominator + (magnitude % denominator * 2n >= denominator ? 1n : 0n);
  if (cents === 0n) return 0;
  const sign = numerator < 0n ? "-" : "";
  const result = Number(`${sign}${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`);
  return Number.isFinite(result) ? result : null;
}

/** PostgreSQL numeric ROUND(..., 2): exact quotient, halves away from zero. */
export function roundConvertedAmount(amount: number, fromRate: number | string, toRate: number | string): number | null {
  if (!Number.isFinite(amount)) return null;
  const source = decimal(amount), from = decimal(fromRate), to = decimal(toRate);
  if (!source || !from || !to || from.numerator <= 0n || to.numerator <= 0n) return null;
  return roundedQuotient(
    source.numerator * from.numerator * to.denominator * 100n,
    source.denominator * from.denominator * to.numerator,
  );
}

export function roundCurrencyAmount(amount: number): number | null {
  return roundConvertedAmount(amount, 1, 1);
}
