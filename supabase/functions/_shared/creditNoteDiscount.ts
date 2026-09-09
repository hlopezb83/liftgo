export type CreditNoteDiscountType = "%" | "$" | undefined;

export interface CreditNoteDiscountSelection {
  originalGross: number;
  selectedGross: number;
  originalDiscount?: number;
  discountType?: CreditNoteDiscountType;
}

function toCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Number((Math.abs(value) * 100).toFixed(8)));
}

/**
 * Descuento que corresponde a una selección parcial de una línea facturada.
 *
 * Los descuentos porcentuales conservan la tasa. Los descuentos fijos se
 * asignan según la proporción del bruto seleccionado respecto del bruto
 * original, en centavos enteros, y nunca pueden superar la selección.
 *
 * Es la implementación canónica compartida por la UI y `stamp-credit-note`.
 */
export function creditNoteDiscountForSelection({
  originalGross,
  selectedGross,
  originalDiscount,
  discountType,
}: CreditNoteDiscountSelection): number {
  const discount = Number(originalDiscount ?? 0);
  if (!Number.isFinite(discount) || discount <= 0) return 0;

  if (discountType !== "$") {
    return Math.min(discount, 100);
  }

  const originalGrossCents = Math.max(0, toCents(originalGross));
  const selectedGrossCents = Math.max(0, toCents(selectedGross));
  const originalDiscountCents = Math.max(0, toCents(discount));
  if (originalGrossCents === 0 || selectedGrossCents === 0) return 0;

  const selectedRatioNumerator = Math.min(selectedGrossCents, originalGrossCents);
  const allocatedCents = Math.round(
    (originalDiscountCents * selectedRatioNumerator) / originalGrossCents,
  );
  return Math.min(selectedGrossCents, allocatedCents) / 100;
}
