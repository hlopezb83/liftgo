import { describe, expect, it, vi } from "vitest";
import type { WorkBook } from "@e965/xlsx";
import { formatDateMty } from "@/lib/format/dateFormats";
const captured = vi.hoisted(() => ({ workbook: undefined as WorkBook | undefined }));
vi.mock("@e965/xlsx", async (importOriginal) => ({
  ...await importOriginal<typeof import("@e965/xlsx")>(),
  writeFile: (workbook: WorkBook) => { captured.workbook = workbook; },
}));
import { downloadReconciliationXlsx } from "../reconciliationExport";
import type { ReconciliationRow } from "../../hooks/reconciliation/useReconciliationData";
function invoice(issued_at: string): ReconciliationRow {
  return { id: "qa-invoice", invoice_number: "QA-0001", issued_at, customer_name: "QA", status: "sent", cfdi_status: "stamped", cancellation_status: null, cfdi_uuid: "qa-uuid", facturapi_invoice_id: "qa-id", facturapi_env: "test", total: 100, moneda: "MXN", tipo_cambio: 1 };
}
describe("QR05: reconciliation XLSX preserves civil dates", () => {
  it.each([["2026-10-20", "20/10/2026"], ["2026-01-01", "01/01/2026"], ["2024-02-29", "29/02/2024"]])("preserves the civil day for %s", async (date, correct) => {
    expect(formatDateMty(date)).toBe(correct);
    await downloadReconciliationXlsx([invoice(date)]);
    expect(captured.workbook?.Sheets["Conciliación"].B2.v).toBe(correct);
  });
  it.each(["2026-10-20T12:00:00Z", "2026-01-01T02:00:00Z"])("control: actual timestamp %s keeps the Monterrey timezone", async (date) => {
    await downloadReconciliationXlsx([invoice(date)]);
    expect(captured.workbook?.Sheets["Conciliación"].B2.v).toBe(formatDateMty(date));
  });
});
