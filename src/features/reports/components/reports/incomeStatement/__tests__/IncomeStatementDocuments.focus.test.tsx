import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IncomeStatementDocuments } from "../IncomeStatementDocuments";
import type { StatementDocument } from "../../../../hooks/incomeStatement/documentDrilldown";

const state = vi.hoisted(() => ({
  items: [] as StatementDocument[],
  fetching: false,
}));
vi.mock("@/features/users", () => ({
  useUserRole: () => ({ data: "auditor" }),
}));
vi.mock("@/features/accounts-payable/hooks/useSupplierBill", () => ({
  useSupplierBill: () => ({ data: null, isLoading: false, isError: false }),
}));
vi.mock("@/features/accounts-payable/hooks/useSupplierBillMutations", () => ({
  useDeleteSupplierBill: () => ({ mutate: vi.fn() }),
}));
vi.mock(
  "@/features/accounts-payable/components/SupplierBillDetailContent",
  () => ({ SupplierBillDetailContent: () => null }),
);
// Keep both real Radix sheets: replacing the child with a stub misses the focus loss.
vi.mock("@/features/accounts-payable", async () => ({
  SupplierBillDetailSheet: (
    await import("@/features/accounts-payable/components/SupplierBillDetailSheet")
  ).SupplierBillDetailSheet,
}));
vi.mock(
  "../../../../hooks/incomeStatement/useIncomeStatementDocuments",
  () => ({
    STATEMENT_DOCUMENT_PAGE_SIZE: 25,
    useIncomeStatementDocuments: () => ({
      data: {
        items: state.items,
        total_count: state.items.length,
        total_amount: 100,
        rounding_adjustment: 0,
        limit: 25,
        offset: 0,
        basis: "accrual",
        currency: "MXN",
      },
      isPending: false,
      isFetching: state.fetching,
      isError: false,
    }),
  }),
);
const props = {
  scope: {
    startDate: "2026-10-01",
    endDate: "2026-10-31",
    accountingBasis: "accrual" as const,
  },
  selection: {
    kind: "exp:renta",
    label: null,
    title: "Renta",
    expectedTotal: 100,
    months: ["2026-10"],
  },
  onClose: vi.fn(),
};
const supplierRow: StatementDocument = {
  row_key: "bill:1:2026-10",
  source_type: "supplier_bill",
  document_id: "bill1",
  payment_id: null,
  invoice_id: null,
  folio: "FP-01",
  document_date: "2026-10-01",
  event_date: "2026-10-01",
  month_key: "2026-10",
  currency: "MXN",
  amount: 100,
  label: "Proveedor QA",
  coverage_start: null,
  coverage_end: null,
};
beforeEach(() => {
  state.items = [{ ...supplierRow }];
  state.fetching = false;
});
async function openBill(button: HTMLElement) {
  button.focus();
  fireEvent.click(button);
  await screen.findByText("Factura no encontrada");
}
async function closeBill() {
  const close = screen.getByRole("button", { name: "Cerrar" });
  close.focus();
  fireEvent.click(close);
  await waitFor(() =>
    expect(screen.queryByText("Factura no encontrada")).not.toBeInTheDocument(),
  );
}

describe("MEJ-001 nested supplier-sheet focus", () => {
  it("returns to the folio after Close and repeated Escape dismissal", async () => {
    render(<IncomeStatementDocuments {...props} />);
    const opener = screen.getByRole("button", { name: "FP-01" });
    await openBill(opener);
    await closeBill();
    await waitFor(() => expect(opener).toHaveFocus());
    await openBill(opener);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByText("Factura no encontrada"),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(opener).toHaveFocus());
  });
  it("resolves the newly mounted folio after a report refetch replaces its node", async () => {
    const view = render(<IncomeStatementDocuments {...props} />);
    const original = screen.getByRole("button", { name: "FP-01" });
    await openBill(original);
    state.fetching = true;
    view.rerender(<IncomeStatementDocuments {...props} />);
    expect(original.isConnected).toBe(false);
    state.fetching = false;
    view.rerender(<IncomeStatementDocuments {...props} />);
    await closeBill();
    const current = screen.getByRole("button", { name: "FP-01" });
    expect(current).not.toBe(original);
    await waitFor(() => expect(current).toHaveFocus());
  });
  it("falls back to the still-mounted document inspector if the source row disappears", async () => {
    const view = render(<IncomeStatementDocuments {...props} />);
    await openBill(screen.getByRole("button", { name: "FP-01" }));
    state.items = [];
    view.rerender(<IncomeStatementDocuments {...props} />);
    await closeBill();
    await waitFor(() =>
      expect(
        screen.getByRole("dialog", { name: "Documentos de origen" }),
      ).toHaveFocus(),
    );
    expect(document.body).not.toHaveFocus();
  });
  it("returns to the exact contribution row when several rows share the same bill", async () => {
    state.items.push({
      ...supplierRow,
      row_key: "bill:1:2026-09",
      month_key: "2026-09",
    });
    render(<IncomeStatementDocuments {...props} />);
    const second = screen.getAllByRole("button", { name: "FP-01" })[1];
    await openBill(second);
    await closeBill();
    await waitFor(() => expect(second).toHaveFocus());
  });
});
