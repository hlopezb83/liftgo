/** Shared presentation contract. This is a managerial report, not an accounting ledger. */
export interface IncomeStatementExportContext {
  accountingBasis: "accrual" | "cash";
  periodStart: string;
  periodEnd: string;
  queryPeriodStart?: string;
  queryPeriodEnd?: string;
  generatedAt: string;
  applicationVersion?: string;
  fxMissingCount: number;
  rentedWithoutCostCount: number;
  soldWithoutCostCount: number;
}

export function statementContextLines(
  context: IncomeStatementExportContext,
): string[] {
  const cash = context.accountingBasis === "cash";
  return [
    `Reporte gerencial. No sustituye la contabilidad oficial. Versión de aplicación: ${context.applicationVersion ?? "no disponible"}.`,
    `Periodo: ${context.periodStart} a ${context.periodEnd}. Moneda: MXN. Base: ${cash ? "Efectivo" : "Devengado"}.`,
    `Generado: ${context.generatedAt} (UTC). No representa un cierre contable bloqueado.`,
    cash
      ? "Facturas por cobro; proveedores por pago. Las demás partidas conservan sus fechas propias. No equivale a conciliación bancaria. Depreciación excluida."
      : "Facturas por emisión; proveedores por emisión o cobertura. Las demás partidas conservan sus fechas propias.",
    "Facturas, notas de crédito y proveedores: subtotal sin IVA. Mantenimiento, daños y gastos operativos: importe registrado, sin separar IVA.",
    ...(cash
      ? [
          "Proveedores sin total positivo: pago sin separar IVA. Notas de crédito por emisión, ponderadas por cobros acumulados, incluso fuera del periodo. Las exclusiones incluyen cobros de otras fechas que intervienen en notas de crédito del periodo.",
        ]
      : []),
    ...(context.queryPeriodStart &&
    context.queryPeriodEnd &&
    (context.queryPeriodStart !== context.periodStart ||
      context.queryPeriodEnd !== context.periodEnd)
      ? [
          `Las advertencias corresponden a la consulta completa ${context.queryPeriodStart} a ${context.queryPeriodEnd}; no se recalculan al seleccionar un año.`,
        ]
      : []),
    `Exclusiones que afectan este reporte: ${context.fxMissingCount} registros de facturas, proveedores o cobros sin conversión válida; ${cash ? 0 : context.rentedWithoutCostCount} equipos rentados sin costo; ${context.soldWithoutCostCount} equipos vendidos sin costo.`,
    "Software excluido. Mantenimiento registrado también como factura de proveedor puede duplicarse: use un solo canal por evento.",
  ];
}

/** null = not applicable; cost increases are unfavorable in every renderer. */
export function isFavorableStatementDelta(
  delta: number | null,
  isCost = false,
): boolean | null {
  return delta === null ? null : isCost ? delta <= 0 : delta >= 0;
}

export function withStatementCsvContext(
  rows: Record<string, unknown>[],
  context: IncomeStatementExportContext,
  company: { razon_social: string; rfc: string },
): Record<string, unknown>[] {
  // Repeat explicit context columns so each row remains interpretable when filtered or copied.
  const metadata = {
    Empresa: company.razon_social,
    RFC: company.rfc,
    "Periodo desde": context.periodStart,
    "Periodo hasta": context.periodEnd,
    "Consulta desde": context.queryPeriodStart ?? context.periodStart,
    "Consulta hasta": context.queryPeriodEnd ?? context.periodEnd,
    Base: context.accountingBasis === "cash" ? "Efectivo" : "Devengado",
    Moneda: "MXN",
    "Generado UTC": context.generatedAt,
    "Alcance y exclusiones": statementContextLines(context).join(" "),
  };
  return rows.map((row) => ({ ...metadata, ...row }));
}

export function statementPeriod(
  start: string,
  end: string,
  selectedYear: string,
) {
  if (!/^\d{4}$/.test(selectedYear))
    return { periodStart: start, periodEnd: end };
  return {
    periodStart:
      start > `${selectedYear}-01-01` ? start : `${selectedYear}-01-01`,
    periodEnd: end < `${selectedYear}-12-31` ? end : `${selectedYear}-12-31`,
  };
}

/** Six monthly columns leave room for amounts, labels and the full-period total on A4. */
export function statementMonthChunks<T>(
  months: T[],
): { start: number; months: T[] }[] {
  if (months.length === 0) return [{ start: 0, months: [] }];
  const chunks: { start: number; months: T[] }[] = [];
  for (let start = 0; start < months.length; start += 6) {
    chunks.push({ start, months: months.slice(start, start + 6) });
  }
  return chunks;
}
