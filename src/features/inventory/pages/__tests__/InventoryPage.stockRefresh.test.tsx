import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InventoryPage from "../InventoryPage";

// Keep the real page → detail → adjustment chain; only data/network and modal
// shells are substituted. No backend inventory is touched by these tests.
const mocks = vi.hoisted(() => ({ stock: 12, present: true, mutate: vi.fn() }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => true }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false, useIsTabletOrBelow: () => true }));
vi.mock("@/layouts/RoleGuard", () => ({ RoleGuard: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("../../hooks/usePartsInventory", () => ({
  usePartsInventory: () => ({
    data: mocks.present ? [{ id: "p-1", name: "Filtro QA", sku: "QA-1", category: "Filtros", stock_quantity: mocks.stock, min_stock_level: 3, unit_cost: 480, created_at: "2026-10-22T00:00:00Z", updated_at: "2026-10-22T00:00:00Z" }] : [],
    isLoading: false, isError: false, refetch: vi.fn(),
  }),
  useDeletePart: () => ({ mutate: vi.fn(), isPending: false }),
  useAdjustPartStock: () => ({ mutate: mocks.mutate, isPending: false }),
}));
vi.mock("../../components/inventory/PartFormDialog", () => ({ PartFormDialog: () => null }));
vi.mock("../../components/inventory/ActivatePartDialog", () => ({ ActivatePartDialog: () => null }));
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div role="dialog" aria-label="Detalle">{children}</div> : null,
  SheetContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));
vi.mock("@/components/forms/FormDialog", () => ({
  FormDialog: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div role="dialog" aria-label="Ajuste">{children}</div> : null,
  FormDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/forms/FormDialogCancelButton", () => ({
  FormDialogCancelButton: ({ onCancel }: { onCancel: () => void }) => <button onClick={onCancel}>Cancelar ajuste</button>,
}));

beforeEach(() => { mocks.stock = 12; mocks.present = true; mocks.mutate.mockReset(); });
afterEach(cleanup);

function openDetail() {
  fireEvent.keyDown(screen.getByRole("button", { name: /Filtro QA/ }), { key: "Enter" });
}
function openAdjustment() {
  fireEvent.click(screen.getByRole("button", { name: "Ajustar existencias" }));
}
function enterCount(quantity: number, reason: string) {
  fireEvent.change(screen.getByLabelText("Conteo físico *"), { target: { value: String(quantity) } });
  fireEvent.change(screen.getByLabelText("Motivo del ajuste *"), { target: { value: reason } });
}

describe("InventoryPage stock refresh", () => {
  it("updates the detail and uses current stock for two consecutive adjustments without closing the detail", () => {
    const view = render(<InventoryPage />);
    openDetail();
    openAdjustment();
    expect(screen.getByLabelText("Conteo físico *")).toHaveValue(12);
    enterCount(15, "Primer conteo QA");
    fireEvent.click(screen.getByRole("button", { name: "Guardar ajuste" }));
    expect(mocks.mutate.mock.calls[0][0]).toEqual({ id: "p-1", expectedQuantity: 12, newQuantity: 15, reason: "Primer conteo QA" });
    act(() => mocks.mutate.mock.calls[0][1].onSuccess());
    mocks.stock = 15;
    view.rerender(<InventoryPage />);
    expect(screen.getByRole("dialog", { name: "Detalle" })).toHaveTextContent("15 unidades");
    openAdjustment();
    expect(screen.getByLabelText("Conteo físico *")).toHaveValue(15);
    expect(screen.getByLabelText("Motivo del ajuste *")).toHaveValue("");
    enterCount(18, "Segundo conteo QA");
    fireEvent.click(screen.getByRole("button", { name: "Guardar ajuste" }));
    expect(mocks.mutate.mock.calls[1][0]).toEqual({ id: "p-1", expectedQuantity: 15, newQuantity: 18, reason: "Segundo conteo QA" });
    act(() => mocks.mutate.mock.calls[1][1].onSuccess());
    mocks.stock = 18;
    view.rerender(<InventoryPage />);
    expect(screen.getByRole("dialog", { name: "Detalle" })).toHaveTextContent("18 unidades");
  });

  it("refreshes the detail without replacing the expected stock or draft of an already open adjustment", () => {
    const view = render(<InventoryPage />);
    openDetail();
    openAdjustment();
    enterCount(18, "Conteo en curso");
    mocks.stock = 15;
    view.rerender(<InventoryPage />);
    expect(screen.getByRole("dialog", { name: "Detalle" })).toHaveTextContent("15 unidades");
    expect(screen.getByText("Existencias al abrir: 12 unidades")).toBeInTheDocument();
    expect(screen.getByLabelText("Conteo físico *")).toHaveValue(18);
    expect(screen.getByLabelText("Motivo del ajuste *")).toHaveValue("Conteo en curso");
    fireEvent.click(screen.getByRole("button", { name: "Guardar ajuste" }));
    expect(mocks.mutate.mock.calls[0][0]).toMatchObject({ expectedQuantity: 12, newQuantity: 18 });
    // A failed/conflicting mutation does not close the dialog or silently retry.
    expect(screen.getByRole("dialog", { name: "Ajuste" })).toBeInTheDocument();
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar ajuste" }));
    openAdjustment();
    expect(screen.getByText("Existencias al abrir: 15 unidades")).toBeInTheDocument();
    expect(screen.getByLabelText("Conteo físico *")).toHaveValue(15);
  });

  it("does not retain an actionable stale detail when the selected part disappears", () => {
    const view = render(<InventoryPage />);
    openDetail();
    mocks.present = false;
    view.rerender(<InventoryPage />);
    expect(screen.queryByRole("dialog", { name: "Detalle" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajustar existencias" })).not.toBeInTheDocument();
  });
});
