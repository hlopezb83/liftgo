import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RevenueReport } from "@/features/reports/components/reports/RevenueReport";
vi.mock("@/lib/router-compat", () => ({
  useLocation: () => ({ pathname: "/reports", search: "?type=revenue" }),
}));
type Row = { invoiced: number };
type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnTo: string;
  invoiced: number;
  paid: number;
  invoices: Array<{ total: number }>;
};
const state = vi.hoisted(() => ({ amount: 100, paid: 0, hasMonth: true }));
vi.mock("@/features/reports/hooks/useRevenueByMonthReport", () => ({
  useRevenueByMonthReport: () => ({
    data: state.hasMonth ? [
      {
        monthKey: "2026-10",
        invoiced: state.amount,
        paid: state.paid,
        invoiceCount: 1,
        fxMissingCount: 0,
      },
    ] : [],
    isLoading: false,
    isError: false,
  }),
  useRevenueMonthInvoices: () => ({
    data: [
      {
        id: "qa",
        total: state.amount,
        issued_at: "2026-10-12",
        moneda: "MXN",
        status: "sent",
        invoice_number: "QA",
      },
    ],
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/components/dataTable/v2", () => ({
  useLiftgoTable: (x: { data: Row[] }) => x,
  DataTableV2: ({
    table,
    onRowClick,
  }: {
    table: { data: Row[] };
    onRowClick: (row: Row) => void;
  }) => table.data.map((row, index) => (
    <button key={index} onClick={() => onRowClick(row)}>
      Fila actual {row.invoiced}
    </button>
  )),
}));
vi.mock("@/lib/charts/useChartSizing", () => ({ useChartSizing: () => ({}) }));
vi.mock("recharts", () => {
  const C = () => null;
  return {
    BarChart: C,
    Bar: C,
    XAxis: C,
    YAxis: C,
    Tooltip: C,
    CartesianGrid: C,
    ResponsiveContainer: C,
  };
});
vi.mock(
  "@/features/reports/components/reports/drilldown/RevenueMonthDetailSheet",
  () => ({
    RevenueMonthDetailSheet: ({
      open,
      invoiced,
      paid,
      invoices,
      returnTo,
      onOpenChange,
    }: SheetProps) =>
      open ? (
        <div data-testid="sheet" data-return-to={returnTo}>
          <button onClick={() => onOpenChange(false)}>Cerrar detalle</button>
          Resumen {invoiced}; Pagado {paid}; Detalle {invoices[0]?.total}
        </div>
      ) : null,
  }),
);
afterEach(cleanup);
it("refreshes selected revenue summary along with current rows", () => {
  const props = {
    startDate: new Date(2026, 9, 1),
    endDate: new Date(2026, 9, 31),
  };
  const view = render(<RevenueReport {...props} />);
  expect(screen.queryByTestId("sheet")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Fila actual 100" }));
  expect(screen.getByTestId("sheet")).toHaveTextContent(
    "Resumen 100; Pagado 0; Detalle 100",
  );
  expect(screen.getByTestId("sheet")).toHaveAttribute("data-return-to", "/reports?type=revenue&from=2026-10-01&to=2026-10-31");
  state.amount = 200;
  state.paid = 50;
  view.rerender(<RevenueReport {...props} />);
  expect(
    screen.getByRole("button", { name: "Fila actual 200" }),
  ).toBeInTheDocument();
  expect(screen.getByTestId("sheet")).toHaveTextContent(
    "Resumen 200; Pagado 50; Detalle 200",
  );
  fireEvent.click(screen.getByRole("button", { name: "Fila actual 200" }));
  expect(screen.getByTestId("sheet")).toHaveTextContent(
    "Resumen 200; Pagado 50; Detalle 200",
  );
  fireEvent.click(screen.getByRole("button", { name: "Cerrar detalle" }));
  expect(screen.queryByTestId("sheet")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Fila actual 200" }));
  expect(screen.getByTestId("sheet")).toBeInTheDocument();
  state.hasMonth = false;
  view.rerender(<RevenueReport {...props} />);
  expect(screen.queryByTestId("sheet")).not.toBeInTheDocument();
});
