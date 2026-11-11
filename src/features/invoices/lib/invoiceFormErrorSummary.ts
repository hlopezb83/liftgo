const labels: Record<string, string> = {
  customerId: "Cliente", customerName: "Cliente", bookingId: "Reserva", bookingIds: "Reservas",
  issueDate: "Fecha de factura", dueDate: "Vencimiento", billingPeriodStart: "Inicio del periodo", billingPeriodEnd: "Fin del periodo",
  lineItems: "Partidas", description: "Descripción", quantity: "Cantidad", unit_price: "Precio unitario", taxRate: "IVA", tax_rate: "IVA",
  clave_prod_serv: "Clave SAT", clave_unidad: "Unidad SAT", discount: "Descuento", total: "Importe", notes: "Notas",
  moneda: "Moneda", tipoCambio: "Tipo de cambio", formaPago: "Forma de pago", metodoPago: "Método de pago", usoCfdi: "Uso CFDI",
  globalPeriodicity: "Periodicidad", globalMonths: "Meses", globalYear: "Año", receptorRfc: "RFC del receptor",
  receptorRazonSocial: "Razón social", receptorRegimenFiscal: "Régimen fiscal", receptorDomicilioFiscalCp: "Código postal fiscal",
};

export function invoiceFormErrorLabel(name: string) {
  const parts = name.split(".");
  const label = labels[parts.at(-1) ?? ""] ?? "Datos de la partida";
  return parts[0] === "lineItems" && /^\d+$/.test(parts[1] ?? "") ? `Partida ${Number(parts[1]) + 1} · ${label}` : label;
}

export function invoiceFormErrorTarget(name: string, isEdit: boolean) {
  if (name === "bookingId" || (isEdit && name === "bookingIds")) return "invoice-details";
  const parts = name.split(".");
  if (parts[0] === "lineItems" && parts.length > 2 && !["description", "quantity", "unit_price", "clave_prod_serv", "clave_unidad"].includes(parts[2])) {
    // Source provenance and inherited discounts have no editable control.
    return parts.slice(0, 2).join(".");
  }
  return name;
}
