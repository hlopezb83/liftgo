import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MaintenanceCostReport } from "./MaintenanceCostReport";
import { UtilizationReport } from "./UtilizationReport";

const state = vi.hoisted(() => ({
  detail: {
    data: undefined as unknown[] | undefined,
    isPending: true,
    isError: false,
    isFetching: true,
    refetch: vi.fn(),
  },
  maintenance: {
    data: undefined as
      { name: string; totalCost: number; count: number }[] | undefined,
    isPending: true,
    isError: false,
    isFetching: true,
    refetch: vi.fn(),
  },
  aggregateRetry: vi.fn(),
  exportCsv: vi.fn(),
}));
vi.mock("@/components/dataTable/v2", () => ({
  useLiftgoTable: (options: unknown) => options,
  DataTableV2: ({
    table,
    emptyMessage,
    onRowClick,
  }: {
    table: { data: { name: string }[] };
    emptyMessage: string;
    onRowClick?: (row: unknown) => void;
  }) =>
    table.data.length ? (
      <button onClick={() => onRowClick?.(table.data[0])}>
        {table.data[0].name}
      </button>
    ) : (
      <p>{emptyMessage}</p>
    ),
}));
vi.mock("@/features/bookings", () => ({
  BOOKINGS_RANGE_LIMIT: 500,
  useBookingsRange: () => state.detail,
}));
vi.mock("../../hooks/useUtilizationReportData", () => ({
  useUtilizationByUnitReport: () => ({
    data: [
      {
        id: "F1",
        name: "QA-01",
        bookedDays: 5,
        totalDays: 10,
        utilization: 50,
      },
    ],
    isError: false,
    isFetching: false,
    refetch: state.aggregateRetry,
  }),
}));
vi.mock("../../hooks/useMaintenanceCostByUnitReport", () => ({
  useMaintenanceCostByUnitReport: () => state.maintenance,
}));
vi.mock("@/lib/charts/useChartSizing", () => ({
  useChartSizing: () => ({
    tick: {},
    rotatedXAxis: {},
    moneyAxisWidth: 80,
    chartHeightClass: "",
    isMobile: false,
  }),
}));
vi.mock("recharts", () => ({
  BarChart: () => null,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: () => null,
}));
vi.mock("@/hooks/useNavigateTransition", () => ({
  useNavigateTransition: () => vi.fn(),
}));
vi.mock("@/lib/exportCsv", () => ({ exportToCsv: state.exportCsv }));
const dates = {
  startDate: new Date("2026-10-01"),
  endDate: new Date("2026-10-10"),
};
beforeEach(() => {
  Object.assign(state.detail, {
    data: undefined,
    isPending: true,
    isError: false,
    isFetching: true,
  });
  Object.assign(state.maintenance, {
    data: undefined,
    isPending: true,
    isError: false,
    isFetching: true,
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const assertNoFalseEmptyDetail = () => {
  expect(
    screen.queryByText("Sin reservas en el rango"),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByText("Reservas en el rango (0)"),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("0 días")).not.toBeInTheDocument();
  expect(screen.getByText("5")).toBeInTheDocument();
  expect(screen.getByText("50%")).toBeInTheDocument();
};
describe("utilization independent detail query", () => {
  it("preserves the aggregate without claiming zero while detail is pending", () => {
    render(<UtilizationReport {...dates} />);
    fireEvent.click(screen.getByText("QA-01"));
    expect(screen.getByRole("status")).toHaveTextContent("Cargando reservas");
    assertNoFalseEmptyDetail();
  });
  it("shows a detail-only error and retries only that query, then renders success", () => {
    Object.assign(state.detail, {
      isPending: false,
      isError: true,
      isFetching: false,
    });
    const view = render(<UtilizationReport {...dates} />);
    fireEvent.click(screen.getByText("QA-01"));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No se pudieron cargar las reservas",
    );
    assertNoFalseEmptyDetail();
    fireEvent.click(
      screen.getByRole("button", { name: "Reintentar reservas" }),
    );
    expect(state.detail.refetch).toHaveBeenCalledOnce();
    expect(state.aggregateRetry).not.toHaveBeenCalled();
    state.detail.isFetching = true;
    view.rerender(<UtilizationReport {...dates} />);
    expect(
      screen.getByRole("button", { name: "Reintentar reservas" }),
    ).toBeDisabled();
    assertNoFalseEmptyDetail();
    Object.assign(state.detail, {
      isError: false,
      isFetching: false,
      data: [
        {
          id: "B1",
          booking_number: "QA-RES",
          customer_name: "Demo",
          forklift_id: "F1",
          start_date: "2026-10-01",
          end_date: "2026-10-05",
          status: "confirmed",
        },
      ],
    });
    view.rerender(<UtilizationReport {...dates} />);
    expect(screen.getByText("Reservas en el rango (1)")).toBeInTheDocument();
    expect(screen.getByText("5 días")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("shows empty only after a successful empty response", () => {
    Object.assign(state.detail, {
      data: [],
      isPending: false,
      isFetching: false,
    });
    render(<UtilizationReport {...dates} />);
    fireEvent.click(screen.getByText("QA-01"));
    expect(screen.getByText("Sin reservas en el rango")).toBeInTheDocument();
    expect(screen.getByText("Reservas en el rango (0)")).toBeInTheDocument();
  });
  it("does not misrepresent cached detail as current after a refetch failure", () => {
    Object.assign(state.detail, {
      data: [],
      isPending: false,
      isError: true,
      isFetching: false,
    });
    render(<UtilizationReport {...dates} />);
    fireEvent.click(screen.getByText("QA-01"));
    assertNoFalseEmptyDetail();
  });
});
describe("maintenance report query states", () => {
  it("shows loading and disables export instead of premature empty", () => {
    render(<MaintenanceCostReport {...dates} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Cargando costos de mantenimiento",
    );
    expect(
      screen.queryByText("Sin mantenimientos en el rango"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exportar CSV" })).toBeDisabled();
  });
  it("shows a confirmed empty result with export disabled", () => {
    Object.assign(state.maintenance, {
      data: [],
      isPending: false,
      isFetching: false,
    });
    render(<MaintenanceCostReport {...dates} />);
    expect(
      screen.getByText("Sin mantenimientos en el rango"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Exportar CSV" })).toBeDisabled();
  });
  it("preserves error/retry and recovers to export a successful result", () => {
    Object.assign(state.maintenance, {
      isPending: false,
      isError: true,
      isFetching: false,
    });
    const view = render(<MaintenanceCostReport {...dates} />);
    expect(
      screen.getByText(
        "No se pudo cargar el reporte de costos de mantenimiento",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Sin mantenimientos en el rango"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Exportar CSV" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(state.maintenance.refetch).toHaveBeenCalledOnce();
    state.maintenance.isFetching = true;
    view.rerender(<MaintenanceCostReport {...dates} />);
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeDisabled();
    Object.assign(state.maintenance, {
      isError: false,
      isFetching: false,
      data: [{ name: "QA-M", totalCost: 150, count: 2 }],
    });
    view.rerender(<MaintenanceCostReport {...dates} />);
    expect(screen.getByText("QA-M")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Exportar CSV" }));
    expect(state.exportCsv).toHaveBeenCalledWith("costos-mantenimiento.csv", [
      { name: "QA-M", totalCost: 150, count: 2 },
    ]);
  });
});
