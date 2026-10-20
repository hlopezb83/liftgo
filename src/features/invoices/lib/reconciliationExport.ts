// R-Perf P2-8: import dinámico para no cargar 106 KB gz al montar la ruta.
import { format } from "date-fns";
import { isFxMissing } from "@/features/cash-flow";
import { formatDateMty } from "@/lib/format/dateFormats";
import { toMxn } from "@/lib/money";
import { nowMty } from "@/lib/utils";
import type { ReconciliationRow } from "../hooks/reconciliation/useReconciliationData";

const HEADERS = [
  "Folio interno",
  "Fecha",
  "Cliente",
  "Estado interno",
  "Estado CFDI",
  "UUID SAT",
  "ID Facturapi",
  "Ambiente PAC",
  "Total (moneda original)",
  "Moneda",
  "Tipo de cambio",
  "Total (MXN)",
  "Inclusión en total timbrado",
] as const;

function exchangeRateCell(rate: number | null): string | number {
  if (rate == null) return "";
  return Number.isFinite(Number(rate)) ? Number(rate) : "Inválido";
}

function currencyCell(currency: string | null): string {
  return currency == null ? "MXN (por defecto)" : currency.toUpperCase();
}

function isCancelled(row: ReconciliationRow): boolean {
  return row.status === "cancelled" || row.cfdi_status === "cancelled";
}

function inclusionLabel(cancelled: boolean, stampedLive: boolean, fxMissing: boolean): string {
  if (cancelled) return "No: cancelada";
  if (!stampedLive) return "No: no timbrada en producción";
  return fxMissing ? "No: sin tipo de cambio válido" : "Sí";
}

export async function downloadReconciliationXlsx(rows: ReconciliationRow[]): Promise<string> {
  const XLSX = await import("@e965/xlsx");
  const data: (string | number)[][] = [[...HEADERS]];
  let total = 0;
  let missingFx = 0;
  for (const r of rows) {
    const fxMissing = isFxMissing(r.moneda, r.tipo_cambio);
    const totalMxn = fxMissing ? null : toMxn(Number(r.total), r.moneda, r.tipo_cambio);
    const cancelled = isCancelled(r);
    const stampedLive = !cancelled && r.cfdi_status === "stamped" && r.facturapi_env === "live";
    data.push([
      r.invoice_number,
      formatDateMty(r.issued_at),
      r.customer_name ?? "",
      r.status,
      r.cfdi_status ?? "",
      r.cfdi_uuid ?? "",
      r.facturapi_invoice_id ?? "",
      r.facturapi_env ?? "",
      Number(Number(r.total).toFixed(2)),
      currencyCell(r.moneda),
      exchangeRateCell(r.tipo_cambio),
      totalMxn == null ? "" : Number(totalMxn.toFixed(2)),
      inclusionLabel(cancelled, stampedLive, fxMissing),
    ]);
    // Mismo criterio que computeSummary: las canceladas se conservan en el
    // detalle, pero no alimentan el total ni el aviso de tipo de cambio faltante.
    if (stampedLive) {
      if (fxMissing) {
        missingFx++;
      } else {
        total += totalMxn ?? 0;
      }
    }
  }
  // QR07: el total normalizado se alinea con MXN, nunca con los importes
  // originales que pueden mezclar divisas. Las filas no elegibles se explican.
  data.push([
    "", "", "", "", "", "", "", "", "", "", "TOTAL TIMBRADO (MXN)",
    Number(total.toFixed(2)), "Sólo timbradas en producción no canceladas y con tipo de cambio válido",
  ]);
  if (missingFx > 0) {
    data.push([
      "", "", "", "", "", "", "", "", "", "", "SIN TIPO DE CAMBIO", "",
      `${missingFx} factura(s) timbrada(s) en producción excluida(s) del total`,
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [
    { wch: 14 }, { wch: 12 }, { wch: 32 }, { wch: 12 }, { wch: 12 },
    { wch: 38 }, { wch: 26 }, { wch: 12 }, { wch: 24 },
    { wch: 20 }, { wch: 26 }, { wch: 16 }, { wch: 65 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Conciliación");
  const filename = `conciliacion-facturas-${format(nowMty(), "ddMMyyyy-HHmm")}.xlsx`;
  XLSX.writeFile(wb, filename);
  return filename;
}
