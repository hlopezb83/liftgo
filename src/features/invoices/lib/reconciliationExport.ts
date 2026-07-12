import * as XLSX from "@e965/xlsx";
import { formatDateMty } from "@/lib/format/dateFormats";
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
  "Total",
] as const;

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return formatDateMty(d);
}

export function downloadReconciliationXlsx(rows: ReconciliationRow[]): string {
  const data: (string | number)[][] = [[...HEADERS]];
  let total = 0;
  for (const r of rows) {
    data.push([
      r.invoice_number,
      fmtDate(r.issued_at),
      r.customer_name ?? "",
      r.status,
      r.cfdi_status ?? "",
      r.cfdi_uuid ?? "",
      r.facturapi_invoice_id ?? "",
      r.facturapi_env ?? "",
      Number(Number(r.total).toFixed(2)),
    ]);
    if (r.cfdi_status === "stamped" && r.facturapi_env === "live") total += Number(r.total);
  }
  data.push(["", "", "", "", "", "", "", "TOTAL TIMBRADO", Number(total.toFixed(2))]);

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [
    { wch: 14 }, { wch: 12 }, { wch: 32 }, { wch: 12 }, { wch: 12 },
    { wch: 38 }, { wch: 26 }, { wch: 12 }, { wch: 14 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Conciliación");
  const filename = `conciliacion-facturas-${format(nowMty(), "ddMMyyyy-HHmm")}.xlsx`;
  XLSX.writeFile(wb, filename);
  return filename;
}
