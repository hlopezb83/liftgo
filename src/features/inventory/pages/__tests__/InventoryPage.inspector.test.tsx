import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { type ReactNode, useEffect, useReducer } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TestRouter } from "@/test/router";
import type { PartInventory } from "../../hooks/usePartsInventory";
import InventoryPage from "../InventoryPage";

const mocks = vi.hoisted(() => ({ mobile: false, present: true, detail: vi.fn(), list: vi.fn(), refresh: vi.fn(), retry: vi.fn(), mutate: vi.fn() }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => true }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => mocks.mobile, useIsTabletOrBelow: () => mocks.mobile }));
vi.mock("@/layouts/RoleGuard", () => ({ RoleGuard: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("../../hooks/usePartsInventory", () => ({
  useDeletePart: () => ({ mutate: mocks.mutate, isPending: false }),
  useAdjustPartStock: () => ({ mutate: mocks.mutate, isPending: false }),
}));
vi.mock("../../hooks/useInventoryPart", () => ({ useInventoryPart: mocks.detail }));
vi.mock("../../hooks/useInventoryPage", () => ({ useInventoryPage: (filters: unknown) => {
  mocks.list(filters);
  return {
  data: { items: mocks.present ? [part] : [], totalCount: mocks.present ? 1 : 0, pageIndex: 0, lowStockCount: 0 },
  isLoading: false, isError: false, refetch: mocks.refresh,
}; } }));
vi.mock("../../components/ActivatePartDialog", () => ({ ActivatePartDialog: () => null }));
vi.mock("../../components/PartFormDialog", async () => {
  const { FormDialog } = await import("@/components/forms/FormDialog");
  return { PartFormDialog: ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Editar refacción"><input aria-label="Nombre de refacción" /></FormDialog>
  ) };
});
const part = { id: "p-1", name: "Filtro QA", sku: "QA-1", category: "Filtros", stock_quantity: 12, min_stock_level: 3, unit_cost: 480, created_at: "2026-10-22T00:00:00Z", updated_at: "2026-10-22T00:00:00Z" } as PartInventory;
const ready = (data: PartInventory | null = part) => ({ data, isPending: false, isLoading: false, isError: false, isSuccess: true, isFetching: false, error: null, refetch: mocks.retry });
const mount = async () => {
  let refresh!: () => void;
  function Subject() {
    const [, update] = useReducer((value: number) => value + 1, 0);
    useEffect(() => { refresh = update; }, []);
    return <InventoryPage />;
  }
  render(<QueryClientProvider client={new QueryClient()}><TestRouter><Subject /></TestRouter></QueryClientProvider>);
  await screen.findByRole("searchbox");
  return { rerender: () => { act(() => { refresh(); }); } };
};
const action = () => screen.getByRole("button", { name: /Filtro QA/ });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.present = true;
  mocks.detail.mockReturnValue(ready());
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{ width: 100, height: 44 }] as unknown as DOMRectList);
});
afterEach(() => { vi.restoreAllMocks(); expect(mocks.mutate).not.toHaveBeenCalled(); });

describe.each([false, true])("inventory inspector mobile=%s", (mobile) => {
  beforeEach(() => { mocks.mobile = mobile; });

  it("keeps one inspector through loading, error, retry and missing detail without reusing list stock", async () => {
    mocks.detail.mockReturnValue({ ...ready(null), data: undefined, isPending: true, isSuccess: false });
    const view = await mount();
    fireEvent.click(action());
    const inspector = screen.getByRole("dialog");
    expect(inspector).toHaveTextContent("Cargando refacción…");
    expect(within(inspector).queryByText("12 unidades")).not.toBeInTheDocument();
    mocks.detail.mockReturnValue({ ...ready(null), isError: true, isSuccess: false, error: new Error("Synthetic failure") });
    view.rerender();
    expect(screen.getByRole("dialog")).toBe(inspector);
    fireEvent.click(within(inspector).getByRole("button", { name: "Reintentar" }));
    expect(mocks.retry).toHaveBeenCalledOnce();
    mocks.detail.mockReturnValue(ready({ ...part, stock_quantity: 7 }));
    view.rerender();
    expect(screen.getByRole("dialog")).toBe(inspector);
    expect(inspector).toHaveTextContent("7 unidades");
    mocks.detail.mockReturnValue(ready(null));
    view.rerender();
    expect(screen.getByRole("dialog")).toBe(inspector);
    expect(inspector).toHaveTextContent("Esta refacción ya no está disponible en el inventario activo");
    expect(within(inspector).queryByText("7 unidades")).not.toBeInTheDocument();
    expect(within(inspector).queryByRole("button", { name: "Ajustar existencias" })).not.toBeInTheDocument();
    fireEvent.click(within(inspector).getByRole("button", { name: "Actualizar listado" }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
    fireEvent.keyDown(inspector, { key: "Escape" });
    await waitFor(() => expect(action()).toHaveFocus());
  });

  it("resolves the current row after responsive remount, preserving filters and list scroll", async () => {
    const view = await mount();
    const search = screen.getByRole("searchbox");
    fireEvent.change(search, { target: { value: "QA" } });
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith(expect.objectContaining({ search: "QA" })));
    const list = screen.getByRole("region", { name: "Inventario de refacciones" });
    list.scrollTop = 137;
    const previous = action();
    fireEvent.click(previous);
    mocks.mobile = !mobile;
    view.rerender();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(action()).toHaveFocus());
    expect(action()).not.toBe(previous);
    expect(screen.getByRole("region", { name: "Inventario de refacciones" })).toBe(list);
    expect(list.scrollTop).toBe(137);
    expect(screen.getByRole("searchbox")).toHaveValue("QA");
  });

  it("falls back to the list when the row disappears and keeps focus in a newly opened edit form", async () => {
    const view = await mount();
    fireEvent.click(action());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Editar" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Editar refacción" })).toContainElement(document.activeElement as HTMLElement));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    fireEvent.click(action());
    mocks.present = false;
    mocks.detail.mockReturnValue(ready(null));
    view.rerender();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.getByRole("region", { name: "Inventario de refacciones" })).toHaveFocus());
  });
});
