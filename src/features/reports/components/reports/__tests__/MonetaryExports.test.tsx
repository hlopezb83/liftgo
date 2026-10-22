import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Papa from "papaparse";
import { ProfitabilityByModelReport } from "../ProfitabilityByModelReport";
import { RevenueMonthDetailSheet } from "../drilldown/RevenueMonthDetailSheet";
import type { DrilldownInvoice } from "../../../lib/drilldown";

vi.mock("@/components/icons", () => ({ DownloadIcon: () => null, WarnIcon: () => null }));
vi.mock("@/components/feedback/QueryErrorState", () => ({ QueryErrorState: () => null }));
vi.mock("@/components/dataTable/v2", () => ({
  useLiftgoTable: () => ({}), DataTableV2: () => null,
}));
vi.mock("@/features/reports/hooks/useProfitByModelReport", () => ({
  useProfitByModelReport: () => ({
    data: [
      { model: "Loss", units: 1, revenue: 100, maintenance: 150, damages: 0, profit: -50, margin: -50 },
      { model: "Gain", units: 2, revenue: 200.123, maintenance: 50.124, damages: 0, profit: 149.999, margin: 74.9995 },
      { model: "=1+1", units: 1, revenue: 0, maintenance: 10, damages: 0, profit: -10, margin: 0 },
    ], isLoading: false, isError: false,
  }),
}));
vi.mock("../profitabilityByModel/ProfitabilityChart", () => ({ ProfitabilityChart: () => null }));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => vi.fn() }));
vi.mock("@/components/ui/sheet", () => {
  const Container = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return { Sheet: Container, SheetContent: Container, SheetHeader: Container, SheetTitle: Container };
});

let savedBlob: Blob | undefined;
beforeEach(() => {
  savedBlob = undefined;
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    savedBlob = blob as Blob;
    return "blob:monetary-test";
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function exportRows() {
  fireEvent.click(screen.getByRole("button", { name: /Exportar CSV/i }));
  expect(savedBlob).toBeDefined();
  const csv = await savedBlob!.text();
  return { csv, rows: Papa.parse<Record<string, string>>(csv, { header: true }).data };
}

const invoice = (tipo_cambio: DrilldownInvoice["tipo_cambio"]): DrilldownInvoice => ({
  id: "qa", invoice_number: "QA-FX", customer_name: "QA", issued_at: "2026-10-15",
  status: "sent", total: 100, moneda: "USD", tipo_cambio, credited_mxn: 20,
});

function renderInvoice(inv: DrilldownInvoice) {
  render(<RevenueMonthDetailSheet open onOpenChange={vi.fn()} monthLabel="2026-10"
    invoiced={0} paid={0} invoices={[inv]} isLoading={false} isError={false}
    isRetrying={false} onRetry={vi.fn()} />);
}

describe("monthly revenue FX detail and real CSV", () => {
  it.each([null, 0, 1])("keeps USD FX %s unknown in the UI and export", async (fx) => {
    renderInvoice(invoice(fx));
    expect(screen.getByText("Sin T.C.")).toBeInTheDocument();
    const { rows } = await exportRows();
    expect(rows[0]["Total bruto MXN"]).toBe("");
    expect(rows[0]["Facturado neto MXN"]).toBe("");
    expect(rows[0]["Notas de crédito MXN"]).toBe("20");
  });

  it("converts valid USD FX and preserves MXN credit deduction", async () => {
    renderInvoice(invoice(17.5));
    expect(screen.queryByText("Sin T.C.")).not.toBeInTheDocument();
    const { rows } = await exportRows();
    expect(rows[0]["Total bruto MXN"]).toBe("1750");
    expect(rows[0]["Facturado neto MXN"]).toBe("1730");
  });
});

describe("profitability real CSV", () => {
  it("exports losses and gains as numeric fields but sanitizes malicious model text", async () => {
    render(<ProfitabilityByModelReport startDate={new Date(2026, 9, 1)} endDate={new Date(2026, 9, 31)} />);
    const { csv, rows } = await exportRows();
    expect(rows[0]).toMatchObject({ Desde: "2026-10-01", Hasta: "2026-10-31", Moneda: "MXN" });
    expect(rows[0]["Ganancia Neta"]).toBe("-50");
    expect(rows[0]["Margen %"]).toBe("-50");
    expect(rows[1]).toMatchObject({ Ingresos: "200.12", Mantenimiento: "50.12", "Ganancia Neta": "150", "Margen %": "75" });
    expect(rows[2].Modelo).toBe("'=1+1");
    expect(rows[2]["Ganancia Neta"]).toBe("-10");
    expect(csv).not.toContain("'-50");
    expect(rows.reduce((sum, row) => sum + Number(row["Ganancia Neta"]), 0)).toBe(90);
  });
});
