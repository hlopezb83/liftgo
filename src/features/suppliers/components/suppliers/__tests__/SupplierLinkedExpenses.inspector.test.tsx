import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SupplierLinkedExpenses, type LinkedExpense } from "../SupplierLinkedExpenses";

const mocks = vi.hoisted(() => ({ access: true, readBill: vi.fn(), mutate: vi.fn() }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => mocks.access, useUserRole: () => ({ data: "ventas" }) }));
vi.mock("@/features/accounts-payable/hooks/useSupplierBill", () => ({ useSupplierBill: mocks.readBill }));
vi.mock("@/features/accounts-payable/hooks/useSupplierBillMutations", () => ({ useDeleteSupplierBill: () => ({ mutate: mocks.mutate, isPending: false }) }));
vi.mock("@/features/accounts-payable/components/SupplierBillDetailContent", () => ({ SupplierBillDetailContent: ({ bill }: { bill: { id: string } }) => <p>Detalle {bill.id}</p> }));

const expense: LinkedExpense = { id: "supplier-bill-a", expense_date: "2026-11-14", category: "Refacciones", description: "Filtro QA", amount: 250, originalAmount: 250, currency: "MXN" };
const props = { isLoading: false, isError: false, isFetching: false, error: null, onRetry: vi.fn() };
const action = () => screen.getByRole("button", { name: "Ver factura de proveedor" });
function mount() {
  const client = new QueryClient();
  const ui = (expenses = [expense], supplierId = "supplier-a") => <QueryClientProvider client={client}>
    <SupplierLinkedExpenses key={supplierId} expenses={expenses} {...props} />
  </QueryClientProvider>;
  const view = render(ui());
  return { update: (expenses?: LinkedExpense[], supplierId?: string) => view.rerender(ui(expenses, supplierId)) };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access = true;
  mocks.readBill.mockImplementation((id: string | null) => ({ data: id ? { id, bill_number: `Factura ${id}`, status: "draft", approval_status: "not_required", payments: [] } : null, isLoading: false, isError: false }));
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{ width: 100, height: 44 }] as unknown as DOMRectList);
});
afterEach(() => { vi.restoreAllMocks(); expect(mocks.mutate).not.toHaveBeenCalled(); });

it("opens the linked supplier bill by its real id and preserves the mounted table and scroll", async () => {
  mount();
  const table = screen.getByRole("table");
  const region = screen.getByRole("region", { name: "Gastos operativos vinculados" });
  region.scrollTop = 143;
  action().focus();
  fireEvent.click(action());
  expect(await screen.findByRole("dialog", { name: "Factura supplier-bill-a" })).toHaveTextContent("Detalle supplier-bill-a");
  expect(mocks.readBill).toHaveBeenCalledWith("supplier-bill-a");
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(action()).toHaveFocus());
  expect(screen.getByRole("table")).toBe(table);
  expect(region.scrollTop).toBe(143);
});

it("keeps totals and rows available without permission but does not mount or query the bill inspector", () => {
  mocks.access = false;
  mount();
  expect(screen.getByText("Filtro QA")).toBeInTheDocument();
  expect(screen.getByText("$250.00")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Ver factura de proveedor" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Filtro QA"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(mocks.readBill).not.toHaveBeenCalled();
});

it("returns focus to the current row after replacement and to the expenses region if it disappears", async () => {
  const view = mount();
  const oldAction = action();
  fireEvent.click(oldAction);
  view.update([]);
  view.update([{ ...expense, description: "Filtro actualizado" }]);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cerrar" }));
  await waitFor(() => expect(action()).toHaveFocus());
  expect(action()).not.toBe(oldAction);
  fireEvent.click(action());
  view.update([]);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  await waitFor(() => expect(screen.getByRole("region", { name: "Gastos operativos vinculados" })).toHaveFocus());
});

it("clears the open bill when changing supplier context and opens the new supplier's bill", async () => {
  const view = mount();
  fireEvent.click(action());
  view.update([{ ...expense, id: "supplier-bill-b" }], "supplier-b");
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  fireEvent.click(action());
  expect(await screen.findByRole("dialog", { name: "Factura supplier-bill-b" })).toHaveTextContent("Detalle supplier-bill-b");
});
