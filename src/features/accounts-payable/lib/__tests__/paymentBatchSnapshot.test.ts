import * as XLSX from "@e965/xlsx";
import { describe, expect, it } from "vitest";
import { buildPaymentsWorkbook } from "../buildPaymentsXlsx";
import { paymentBatchExportRows, paymentBatchSnapshotSchema } from "../paymentBatchSnapshot";

const item = {
  supplier_name: "Refacciones", supplier_rfc: null, bank_name: "Banco",
  clabe: "012345678901234568", account_number: "000123", account_holder: "Titular",
  bill_number: "CXP-0001", due_date: "2026-10-28", reference: "LIFTGO-CXP-0001",
  concept: "Servicio", amount: 50, currency: "MXN",
};
const snapshot = {
  id: "batch-1", created_at: "2026-10-01T12:00:00Z", cancelled_at: null,
  payment_count: 0, items: [item],
};

describe("bank layout persisted snapshot", () => {
  it("keeps bank/account values as text and totals each currency separately", () => {
    const data = paymentBatchSnapshotSchema.parse({
      ...snapshot, items: [item, { ...item, amount: 20, currency: "USD" }],
    });
    const workbook = buildPaymentsWorkbook(XLSX, paymentBatchExportRows(data));
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(workbook.Sheets.Pagos, { header: 1 });
    expect(rows[1][3]).toBe("012345678901234568");
    expect(rows[1][4]).toBe("000123");
    expect(rows.slice(-2).map((row) => [row[9], row[10], row[11]])).toEqual([
      ["TOTAL MXN", 50, "MXN"], ["TOTAL USD", 20, "USD"],
    ]);
  });
  it("refuses a cancelled layout instead of presenting it as a pending payment", () => {
    expect(() => paymentBatchExportRows({ ...snapshot, cancelled_at: "2026-10-01T13:00:00Z" }))
      .toThrow(/cancelado/);
  });
  it("rejects incomplete/empty payloads instead of claiming an empty workbook is a successful recovery", () => {
    expect(paymentBatchSnapshotSchema.safeParse({ ...snapshot, items: [] }).success).toBe(false);
    expect(paymentBatchSnapshotSchema.safeParse({ ...snapshot, items: [{ ...item, amount: "NaN" }] }).success).toBe(false);
  });
});

