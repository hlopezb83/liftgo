import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { refetch, state } = vi.hoisted(() => ({
  refetch: vi.fn(),
  state: { isError: true, isFetching: false, createdBatchId: null as string | null },
}));
vi.mock("../../hooks/useExportPaymentsForm", () => ({
  useExportPaymentsForm: () => ({
    ...state, isLoading: false, refetch, isSubmitting: false, canExport: false,
    selected: [], totalsByCurrency: [], notes: "", setNotes: vi.fn(), hasInvalid: false,
    rowState: {}, allEligibleSelected: false, toggleAll: vi.fn(), setSelected: vi.fn(),
    setAmount: vi.fn(), handleExport: vi.fn(), retryDownload: refetch,
  }),
}));
import { ExportPaymentsDialog } from "../ExportPaymentsDialog";

beforeEach(() => {
  refetch.mockReset();
  state.isError = true;
  state.createdBatchId = null;
});

describe("payment export query/recovery states", () => {
  it("shows retry instead of an empty eligible-documents list on query failure", () => {
    render(<ExportPaymentsDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo cargar");
    expect(screen.queryByText(/sin facturas/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Descargar Excel/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
  it("offers recovery of the already saved batch without another create action", () => {
    state.createdBatchId = "saved-batch";
    render(<ExportPaymentsDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("El lote quedó guardado");
    expect(screen.queryByRole("button", { name: /Descargar Excel/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar descarga" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

