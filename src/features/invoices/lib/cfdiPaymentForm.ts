export function formaPagoForMetodoChange(
  metodoPago: string | null | undefined,
  currentFormaPago: string | null | undefined,
): string {
  if (metodoPago === "PPD") return "99";
  if (!currentFormaPago || currentFormaPago === "99") return "03";
  return currentFormaPago;
}

export function resolveCfdiFormaPago(
  metodoPago: string | null | undefined,
  formaPago: string | null | undefined,
): string | null {
  if (metodoPago === "PPD") return "99";
  return formaPago || null;
}
