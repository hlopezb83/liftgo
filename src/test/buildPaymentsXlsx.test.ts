import * as XLSX from "@e965/xlsx";
import { describe, it, expect } from "vitest";
import { buildPaymentsWorkbook, type PaymentExportRow } from "@/features/accounts-payable";

const rows: PaymentExportRow[] = [
  {
    supplier_name: "Proveedor Uno SA de CV",
    supplier_rfc: "PRU010101AAA",
    bank_name: "BBVA",
    clabe: "012345678901234567",
    account_number: "1234567890",
    account_holder: "Proveedor Uno SA de CV",
    bill_number: "FAC-0001",
    due_date: "2026-06-15",
    reference: "LIFTGO-FAC-0001",
    concept: "Servicios mantenimiento",
    amount: 1500.5,
    currency: "MXN",
  },
  {
    supplier_name: "Proveedor Dos",
    supplier_rfc: "PRD020202BBB",
    bank_name: "Banorte",
    clabe: "072580001234567890",
    account_number: null,
    account_holder: "Proveedor Dos",
    bill_number: "FAC-0002",
    due_date: null,
    reference: "LIFTGO-FAC-0002",
    concept: "Refacciones",
    amount: 250.25,
    currency: "MXN",
  },
];

describe("buildPaymentsWorkbook", () => {
  it("genera hoja Pagos con encabezados, filas y fila TOTAL", () => {
    const wb = buildPaymentsWorkbook(XLSX, rows);
    expect(wb.SheetNames).toContain("Pagos");
    const ws = wb.Sheets["Pagos"];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    // 1 header + 2 rows + 1 total
    expect(data.length).toBe(4);
    expect(data[0][0]).toBe("Proveedor");
    expect(data[0][10]).toBe("Monto");
    expect(data[1][0]).toBe("Proveedor Uno SA de CV");
    expect(data[1][9]).toBe("15/06/2026");
    const totalRow = data[3] as unknown as (string | number)[];
    expect(totalRow[9]).toBe("TOTAL MXN");
    expect(Number(totalRow[10])).toBeCloseTo(1750.75, 2);
    expect(totalRow[11]).toBe("MXN");
  });

  it("emite un renglón de total por moneda cuando se mezclan monedas", () => {
    const mixed: PaymentExportRow[] = [
      ...rows,
      { ...rows[0], bill_number: "FAC-0003", amount: 100, currency: "USD" },
      { ...rows[1], bill_number: "FAC-0004", amount: 50, currency: "USD" },
    ];
    const wb = buildPaymentsWorkbook(XLSX, mixed);
    const ws = wb.Sheets["Pagos"];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    // 1 header + 4 filas + 2 totales (MXN y USD), sin mezclar montos.
    expect(data.length).toBe(7);
    const totalRows = data.slice(5) as unknown as (string | number)[][];
    expect(totalRows[0][9]).toBe("TOTAL MXN");
    expect(Number(totalRows[0][10])).toBeCloseTo(1750.75, 2);
    expect(totalRows[1][9]).toBe("TOTAL USD");
    expect(Number(totalRows[1][10])).toBeCloseTo(150, 2);
  });

  it("CLABE se preserva como cadena de 18 dígitos", () => {
    const wb = buildPaymentsWorkbook(XLSX, rows);
    const ws = wb.Sheets["Pagos"];
    const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    expect(String(data[1][3])).toBe("012345678901234567");
  });
});
