export function billPageRow(index = 1) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    bill_number: `CXP-${String(index).padStart(4, "0")}`,
    supplier_id: "10000000-0000-4000-8000-000000000001",
    suppliers: { id: "10000000-0000-4000-8000-000000000001", name: "Proveedor QA" },
    issue_date: "2026-09-01", due_date: "2026-09-30",
    subtotal: 100, tax_amount: 16, retention_isr: 0, retention_iva: 0,
    total: 116, balance: 116, currency: "MXN", exchange_rate: 1,
    status: "pending", approval_status: "approved", category: "refacciones",
  };
}

export function zeroSummary() {
  return {
    kpis: {
      totalPendiente: 0, totalVencido: 0, totalPorVencer: 0, pagadoMesActual: 0,
      totalPorAprobar: 0, countPorAprobar: 0, repPendientes: 0, fxMissingCount: 0,
    },
    availableMonths: [] as string[],
  };
}
