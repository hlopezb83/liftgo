import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InventoryPage from "../InventoryPage";

const mocks = vi.hoisted(() => ({ canWrite: true }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => mocks.canWrite }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false, useIsTabletOrBelow: () => true }));
vi.mock("../../hooks/usePartsInventory", () => ({
  usePartsInventory: () => ({ data: [{ id: "p-1", name: "Filtro de aceite", sku: "FLT-001", category: "Filtros", stock_quantity: 12, min_stock_level: 3, unit_cost: 480 }], isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("../../components/inventory/PartDetailSheet", () => ({
  PartDetailSheet: ({ part, open }: { part?: { name: string }; open: boolean }) => open ? <div role="dialog" aria-label="Detalle de refacción">{part?.name}</div> : null,
}));
vi.mock("../../components/inventory/PartFormDialog", () => ({ PartFormDialog: () => null }));
vi.mock("../../components/inventory/ActivatePartDialog", () => ({ ActivatePartDialog: () => null }));

beforeEach(() => { mocks.canWrite = true; });

describe("InventoryPage", () => {
  it("ofrece limpiar una búsqueda vacía sin afirmar que no existen refacciones", async () => {
    render(<InventoryPage />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "No coincide" } });
    expect(await screen.findByText("No hay resultados con los filtros actuales")).toBeInTheDocument();
    expect(screen.queryByText("Sin refacciones registradas")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByRole("button", { name: /Filtro de aceite/ })).toBeInTheDocument();
  });

  it.each(["Enter", " "])("abre la tarjeta usando la tecla %s", (key) => {
    render(<InventoryPage />);
    fireEvent.keyDown(screen.getByRole("button", { name: /Filtro de aceite/ }), { key });
    expect(screen.getByRole("dialog", { name: "Detalle de refacción" })).toHaveTextContent("Filtro de aceite");
  });

  it("mantiene la consulta por teclado y omite alta para un usuario de lectura", () => {
    mocks.canWrite = false;
    render(<InventoryPage />);
    expect(screen.queryByRole("button", { name: "Habilitar refacción" })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("button", { name: /Filtro de aceite/ }), { key: "Enter" });
    expect(screen.getByRole("dialog", { name: "Detalle de refacción" })).toBeInTheDocument();
  });
});
