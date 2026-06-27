import * as XLSX from "@e965/xlsx";
import { format } from "date-fns";
import { nowMty } from "@/lib/utils";

export interface PaymentExportRow {
  supplier_name: string;
  supplier_rfc: string | null;
  bank_name: string;
  clabe: string;
  account_number: string | null;
  account_holder: string | null;
  bill_number: string;
  due_date: string | null;
  reference: string;
  concept: string;
  amount: number;
  currency: string;
}

const HEADERS = [
  "Proveedor",
  "RFC",
  "Banco",
  "CLABE",
  "Cuenta",
  "Titular",
  "Referencia",
  "Concepto",
  "Folio Factura",
  "Fecha Vencimiento",
  "Monto",
  "Moneda",
] as const;

function fmtDueDate(d: string | null): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}

export function buildPaymentsWorkbook(rows: PaymentExportRow[]): XLSX.WorkBook {
  const data: (string | number)[][] = [[...HEADERS]];
  let total = 0;
  for (const r of rows) {
    data.push([
      r.supplier_name,
      r.supplier_rfc ?? "",
      r.bank_name,
      r.clabe,
      r.account_number ?? "",
      r.account_holder ?? "",
      r.reference,
      r.concept,
      r.bill_number,
      fmtDueDate(r.due_date),
      Number(r.amount.toFixed(2)),
      r.currency,
    ]);
    total += Number(r.amount);
  }
  data.push(["", "", "", "", "", "", "", "", "", "TOTAL", Number(total.toFixed(2)), rows[0]?.currency ?? "MXN"]);

  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [
    { wch: 32 }, { wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 14 },
    { wch: 28 }, { wch: 22 }, { wch: 32 }, { wch: 14 }, { wch: 14 },
    { wch: 14 }, { wch: 8 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pagos");
  return wb;
}

export function downloadPaymentsXlsx(rows: PaymentExportRow[]): string {
  const wb = buildPaymentsWorkbook(rows);
  const filename = `pagos-proveedores-${format(nowMty(), "ddMMyyyy-HHmm")}.xlsx`;
  XLSX.writeFile(wb, filename);
  return filename;
}
