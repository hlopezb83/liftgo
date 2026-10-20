import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { useReconciliationData } from "../../hooks/reconciliation/useReconciliationData";
import { downloadReconciliationXlsx } from "../reconciliationExport";
import type { ReconciliationRow } from "../../hooks/reconciliation/useReconciliationData";
import type { WorkBook } from "@e965/xlsx";

const captured = vi.hoisted(() => ({
  workbook: undefined as WorkBook | undefined,
  rows: [] as ReconciliationRow[],
  from: vi.fn(),
}));

vi.mock("@e965/xlsx", async (importOriginal) => ({
  ...await importOriginal<typeof import("@e965/xlsx")>(),
  writeFile: (workbook: WorkBook) => { captured.workbook = workbook; },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: captured.from } }));

function invoice(id: string, overrides: Partial<ReconciliationRow> = {}): ReconciliationRow {
  return {
    id, invoice_number: `QA-${id}`, issued_at: "2026-10-20", customer_name: "QA",
    status: "sent", cfdi_status: "stamped", cancellation_status: null,
    cfdi_uuid: `qa-${id}`, facturapi_invoice_id: `qa-${id}`, facturapi_env: "live",
    total: 100, moneda: "MXN", tipo_cambio: 1,
    ...overrides,
  };
}

function queryBuilder() {
  const builder: Record<string, unknown> = {};
  let start = 0;
  let end = 0;
  for (const method of ["select", "or", "gte", "lte", "order", "eq", "abortSignal"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.range = vi.fn((from: number, to: number) => {
    start = from;
    end = to;
    return builder;
  });
  builder.then = (resolve: (value: { data: ReconciliationRow[]; error: null }) => unknown) =>
    Promise.resolve(resolve({ data: captured.rows.slice(start, end + 1), error: null }));
  return builder;
}

describe("QR07 variant: XLSX and the reconciliation KPI use the same filtered rows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.workbook = undefined;
  });

  it.each([
    ["control", false],
    ["internally cancelled stamped row", true],
  ] as const)("matches the real query summary: %s", async (_name, internallyCancelled) => {
    captured.rows = [
      invoice("0001"),
      invoice("0002", { moneda: "USD", tipo_cambio: 18, status: internallyCancelled ? "cancelled" : "sent" }),
      invoice("0003", { moneda: "USD", tipo_cambio: null }),
      invoice("0004", { moneda: "USD", tipo_cambio: null, status: internallyCancelled ? "cancelled" : "sent" }),
    ];
    const builder = queryBuilder();
    captured.from.mockReturnValue(builder);
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useReconciliationData({
      from: "2026-10-01", to: "2026-10-31", fiscalState: "all", env: "all",
    }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const data = result.current.data;
    if (!data) throw new Error("Expected reconciliation query data");

    expect(builder.gte).toHaveBeenCalledWith("issued_at", "2026-10-01");
    expect(builder.lte).toHaveBeenCalledWith("issued_at", "2026-10-31");
    expect(data.rows).toEqual(captured.rows);
    expect(data.summary.totalStampedLive).toBe(internallyCancelled ? 100 : 1900);
    expect(data.summary.countStampedMissingFx).toBe(internallyCancelled ? 1 : 2);

    // The page passes these exact data.rows to Exportar XLSX and displays
    // data.summary.totalStampedLive as Total timbrado (producción, MXN).
    await downloadReconciliationXlsx(data.rows);
    const ws = captured.workbook?.Sheets["Conciliación"];
    if (!ws) throw new Error("Expected reconciliation workbook");
    expect(ws.L6.v).toBe(data.summary.totalStampedLive);
    expect(ws.M7.v).toBe(`${data.summary.countStampedMissingFx} factura(s) timbrada(s) en producción excluida(s) del total`);
    // Cancelled records remain in the audit detail, with original/conversion
    // amounts intact; only the aggregate eligibility follows the existing KPI.
    expect([ws.A3.v, ws.I3.v, ws.L3.v]).toEqual(["QA-0002", 100, 1800]);
    expect(ws.M3.v).toBe(internallyCancelled ? "No: cancelada" : "Sí");
    expect(ws.M5.v).toBe(internallyCancelled ? "No: cancelada" : "No: sin tipo de cambio válido");
    expect(ws["!ref"]).toBe("A1:M7");
  });
});
