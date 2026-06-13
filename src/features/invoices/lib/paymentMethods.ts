/**
 * Métodos de pago internos + mapeo a forma de pago SAT (catálogo c_FormaPago).
 * Compartido entre el dialog de registro de pago y sus tests.
 */
export const PAYMENT_METHODS = [
  { value: "transfer", label: "Transferencia", sat: "03" },
  { value: "cash", label: "Efectivo", sat: "01" },
  { value: "check", label: "Cheque", sat: "02" },
  { value: "card", label: "Tarjeta", sat: "04" },
] as const;

export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number]["value"];

/** Devuelve el código SAT para un método interno, o "03" (transferencia) por defecto. */
export function satCodeForMethod(method: string): string {
  return PAYMENT_METHODS.find((m) => m.value === method)?.sat ?? "03";
}
