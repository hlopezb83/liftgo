import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActivatePartDialog } from "../ActivatePartDialog";

const mocks = vi.hoisted(() => ({
  query: { data: [{ id: "filter-1", sku: "FLT-001", name: "Filtro de aceite" }], isLoading: false, isError: false, isFetching: false, refetch: vi.fn() },
  mutation: { mutate: vi.fn(), isPending: false },
  validation: vi.fn(),
}));
vi.mock("../../../hooks/usePartsInventory", () => ({ usePartsCatalog: () => mocks.query }));
vi.mock("../../../hooks/usePartInventoryMutations", () => ({ useActivateCatalogPart: () => mocks.mutation }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyValidation: mocks.validation }));
vi.mock("@/hooks/useUnsavedChangesGuard", () => ({ useUnsavedChangesGuard: vi.fn() }));

function choosePart() {
  fireEvent.click(screen.getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: "FLT-001 · Filtro de aceite" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.data = [{ id: "filter-1", sku: "FLT-001", name: "Filtro de aceite" }];
  mocks.query.isLoading = false;
  mocks.query.isError = false;
  mocks.query.isFetching = false;
  mocks.mutation.isPending = false;
});

describe("ActivatePartDialog", () => {
  it("pide confirmar el descarte y permite seguir editando", () => {
    const onClose = vi.fn();
    render(<ActivatePartDialog open onOpenChange={onClose} />);
    fireEvent.change(screen.getByLabelText("Stock inicial"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByText("¿Descartar cambios?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(screen.getByLabelText("Stock inicial")).toHaveValue(12);
    expect(onClose).not.toHaveBeenCalled();
    expect(mocks.mutation.mutate).not.toHaveBeenCalled();
  });

  it("vincula las etiquetas a los campos del inventario local", () => {
    render(<ActivatePartDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("combobox", { name: "SKU LiftGo *" })).toBeEnabled();
    expect(screen.getByLabelText("Stock inicial")).toHaveValue(0);
    expect(screen.getByLabelText("Stock mínimo")).toHaveValue(0);
    expect(screen.getByLabelText("Costo unitario")).toHaveValue(0);
    expect(screen.getByLabelText("Ubicación")).toHaveValue("");
  });

  it("descarta la selección y valores al cerrar y volver a abrir", () => {
    const { rerender } = render(<ActivatePartDialog open onOpenChange={vi.fn()} />);
    choosePart();
    fireEvent.change(screen.getByLabelText("Stock inicial"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Stock mínimo"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Costo unitario"), { target: { value: "480" } });
    fireEvent.change(screen.getByLabelText("Ubicación"), { target: { value: "Pasillo A" } });
    rerender(<ActivatePartDialog open={false} onOpenChange={vi.fn()} />);
    rerender(<ActivatePartDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Seleccionar SKU");
    expect(screen.getByLabelText("Stock inicial")).toHaveValue(0);
    expect(screen.getByLabelText("Stock mínimo")).toHaveValue(0);
    expect(screen.getByLabelText("Costo unitario")).toHaveValue(0);
    expect(screen.getByLabelText("Ubicación")).toHaveValue("");
    expect(mocks.mutation.mutate).not.toHaveBeenCalled();
  });

  it("distingue un catálogo vacío de un fallo de consulta", () => {
    mocks.query.data = [];
    render(<ActivatePartDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByText(/maestro real de SKUs/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Habilitar" })).toBeDisabled();
  });

  it("oculta el catálogo obsoleto y ofrece reintento tras un error", () => {
    mocks.query.isError = true;
    render(<ActivatePartDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByText("No se pudo cargar el catálogo LiftGo")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText(/maestro real de SKUs/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(mocks.query.refetch).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Habilitar" })).toBeDisabled();
  });

  it("bloquea el envío durante la carga aunque haya catálogo en caché", () => {
    mocks.query.isLoading = true;
    render(<ActivatePartDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Habilitar" })).toBeDisabled();
    expect(screen.queryByText(/maestro real de SKUs/)).not.toBeInTheDocument();
  });

  it.each(["Stock inicial", "Stock mínimo"])("rechaza unidades fraccionarias en %s", (label) => {
    render(<ActivatePartDialog open onOpenChange={vi.fn()} />);
    choosePart();
    fireEvent.change(screen.getByLabelText(label), { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Habilitar" }));
    expect(mocks.validation).toHaveBeenCalledWith({ message: "Las existencias y el mínimo deben ser enteros" });
    expect(mocks.mutation.mutate).not.toHaveBeenCalled();
  });

  it("bloquea un SKU seleccionado que dejó de estar activo", () => {
    const { rerender } = render(<ActivatePartDialog open onOpenChange={vi.fn()} />);
    choosePart();
    mocks.query.data = [{ id: "other", sku: "FLT-002", name: "Filtro de aire" }];
    rerender(<ActivatePartDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Habilitar" })).toBeDisabled();
    expect(mocks.mutation.mutate).not.toHaveBeenCalled();
  });

  it("envía sólo el SKU global y los valores locales válidos", () => {
    render(<ActivatePartDialog open onOpenChange={vi.fn()} />);
    choosePart();
    fireEvent.change(screen.getByLabelText("Stock inicial"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Stock mínimo"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Costo unitario"), { target: { value: "480.25" } });
    fireEvent.change(screen.getByLabelText("Ubicación"), { target: { value: "Pasillo A" } });
    fireEvent.click(screen.getByRole("button", { name: "Habilitar" }));
    expect(mocks.mutation.mutate).toHaveBeenCalledWith({ catalogPartId: "filter-1", stockQuantity: 12, minStockLevel: 3, unitCost: 480.25, location: "Pasillo A" }, expect.any(Object));
  });
});
