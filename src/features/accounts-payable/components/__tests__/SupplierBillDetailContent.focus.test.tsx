import { Fragment, useState, type ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeBillPermissions } from "../../lib/billPermissions";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";

const fixture = vi.hoisted(() => ({ actionMount: 0, canManage: true, status: "partial" }));
vi.mock("@/layouts/RoleGuard", () => ({
  RoleGuard: ({ children }: { children: ReactNode }) => fixture.canManage
    ? <Fragment key={fixture.actionMount}>{children}</Fragment> : null,
}));
vi.mock("../BillApprovalSection", () => ({ BillApprovalSection: () => <p>Fixture approval history</p> }));
vi.mock("../CancelSupplierBillDialog", () => ({ CancelSupplierBillDialog: () => null }));
vi.mock("../SupplierBillFormDialog", () => ({ SupplierBillFormDialog: () => null }));
vi.mock("../SupplierPaymentRow", () => ({ SupplierPaymentRow: () => <p>Fixture applied payment</p> }));
vi.mock("../../hooks/useRegisterSupplierPayment", () => ({
  useRegisterSupplierPayment: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));
vi.mock("../../hooks/useUploadSupplierReceipt", () => ({
  useUploadSupplierReceipt: () => ({ isPending: false, mutateAsync: vi.fn() }),
  removeSupplierReceipt: vi.fn(),
}));

import { SupplierBillDetailContent } from "../SupplierBillDetailContent";

const bill = {
  id: "fixture-bill", bill_number: "FIXTURE-USD-123456789", status: "partial", approval_status: "not_required",
  approval_notes: null, approved_at: null, balance: 900, subtotal: 1000, tax_amount: 160,
  retention_iva: 50, retention_isr: 10, total: 1100, exchange_rate: 19, payment_method_sat: "PPD",
  cfdi_uuid: null, currency: "USD", issue_date: "2026-10-20", due_date: "2026-10-30",
  description: "Fixture service", category: "otro", suppliers: { name: "Fixture supplier with a long name", rfc: "AAA010101AAA" },
  payments: [{ id: "fixture-payment", amount: 200 }],
};

function DetailHarness() {
  const [payDialog, setPayDialog] = useState(false);
  const liveBill = { ...bill, status: fixture.status };
  return <SupplierBillDetailContent bill={liveBill} perms={computeBillPermissions(liveBill)} isAdmin
    dialogs={{ payDialog, setPayDialog, cancelDialog: false, setCancelDialog: vi.fn(),
      editDialog: false, setEditDialog: vi.fn(), deleteDialog: false, setDeleteDialog: vi.fn() }}
    onClose={vi.fn()} onDelete={vi.fn()} />;
}

describe("Supplier detail payment context and focus", () => {
  beforeEach(() => { fixture.actionMount = 0; fixture.canManage = true; fixture.status = "partial"; });

  it("keeps historical total, retentions and calculated balance distinct", () => {
    render(<DetailHarness />);
    const normalizer = (text: string) => text;
    expect(screen.getByText(formatCurrencyWithCode(1100, "USD"), { normalizer })).toBeInTheDocument();
    expect(screen.getByText(`-${formatCurrencyWithCode(50, "USD")}`, { normalizer })).toBeInTheDocument();
    expect(screen.getByText(`-${formatCurrencyWithCode(10, "USD")}`, { normalizer })).toBeInTheDocument();
    expect(screen.getByText(formatCurrencyWithCode(900, "USD"), { normalizer })).toBeInTheDocument();
    expect(screen.getByText(/Saldo \(calculado\)/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Registrar pago" })).toHaveLength(1);
  });

  it("hides all management controls with read access while retaining the financial context", () => {
    fixture.canManage = false;
    render(<DetailHarness />);
    expect(screen.queryByRole("button", { name: "Registrar pago" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancelar registro" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Eliminar" })).toBeNull();
    expect(screen.getByText(formatCurrencyWithCode(900, "USD"), { normalizer: (text) => text })).toBeInTheDocument();
  });

  it("restores focus to the currently mounted payment action after responsive remount", async () => {
    const { rerender } = render(<DetailHarness />);
    const original = screen.getByRole("button", { name: "Registrar pago" });
    original.focus();
    fireEvent.click(original);
    expect(await screen.findByRole("dialog", { name: /Registrar pago/ })).toBeInTheDocument();

    fixture.actionMount = 1;
    rerender(<DetailHarness />);
    expect(original.isConnected).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Registrar pago/ })).toBeNull());
    const current = screen.getByRole("button", { name: "Registrar pago" });
    expect(current).not.toBe(original);
    await waitFor(() => expect(current).toHaveFocus());
  });

  it("retains focus on the explanatory blocked payment action after the bill becomes paid", async () => {
    const { rerender } = render(<DetailHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Registrar pago" }));
    expect(await screen.findByRole("dialog", { name: /Registrar pago/ })).toBeInTheDocument();
    fixture.status = "paid";
    rerender(<DetailHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Registrar pago/ })).toBeNull());
    const current = screen.getByRole("button", { name: "Registrar pago" });
    expect(current).toHaveAttribute("aria-disabled", "true");
    expect(current).toHaveAttribute("data-block-code", "supplier_bill_paid");
    await waitFor(() => expect(current).toHaveFocus());
  });

  it("falls back to the current balance region if permissions remove the payment action", async () => {
    const { rerender } = render(<DetailHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Registrar pago" }));
    expect(await screen.findByRole("dialog", { name: /Registrar pago/ })).toBeInTheDocument();
    fixture.canManage = false;
    rerender(<DetailHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Registrar pago/ })).toBeNull());
    expect(screen.queryByRole("button", { name: "Registrar pago" })).toBeNull();
    await waitFor(() => expect(screen.getByRole("region", { name: `Saldo de ${bill.bill_number}` })).toHaveFocus());
  });
});
