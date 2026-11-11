const labels: Record<string, string> = {
  customerId: "Cliente", customerName: "Cliente", dateRange: "Periodo de renta", from: "Fecha de inicio", to: "Fecha final",
  currency: "Moneda", tipoCambio: "Tipo de cambio", taxRate: "IVA", validUntil: "Válida hasta",
  rentalLines: "Equipos de renta", saleLines: "Equipos de venta", modelId: "Modelo", quantity: "Cantidad",
  dailyRate: "Tarifa diaria", weeklyRate: "Tarifa semanal", monthlyRate: "Tarifa mensual", unitPrice: "Precio unitario",
  discount: "Descuento", discountType: "Tipo de descuento", logisticsCost: "Servicio de logística", insuranceCost: "Seguro", notes: "Notas",
};

export function quoteFormErrorLabel(name: string) {
  const parts = name.split(".");
  const label = labels[parts.at(-1) ?? ""] ?? "Campo";
  return /^\d+$/.test(parts[1] ?? "") ? `Equipo ${Number(parts[1]) + 1} · ${label}` : label;
}

export function quoteFormErrorTarget(name: string) {
  return name.endsWith(".discountType") ? name.replace(/\.discountType$/, ".discount") : name;
}
