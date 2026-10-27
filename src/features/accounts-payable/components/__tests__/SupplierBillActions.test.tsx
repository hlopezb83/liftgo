import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { computeBillPermissions } from "../../lib/billPermissions";
import { SupplierBillHeaderActions } from "../SupplierBillHeaderActions";
import { SupplierBillPaymentActions } from "../SupplierBillPaymentActions";

const openBill = { status: "pending", approval_status: "not_required", payments: [] as unknown[] };

describe("Supplier bill actions remain separate with existing business blocks", () => {
  it("executes each secondary action once and leaves payment in its own component", () => {
    const callbacks = { onEditClick: vi.fn(), onCancelClick: vi.fn(), onDeleteClick: vi.fn() };
    render(<SupplierBillHeaderActions bill={openBill} {...computeBillPermissions(openBill)} isAdmin {...callbacks} />);
    for (const [name, callback] of [
      ["Editar", callbacks.onEditClick],
      ["Cancelar registro", callbacks.onCancelClick],
      ["Eliminar", callbacks.onDeleteClick],
    ] as const) {
      fireEvent.click(screen.getByRole("button", { name }));
      expect(callback).toHaveBeenCalledTimes(1);
    }
    expect(screen.queryByRole("button", { name: "Registrar pago" })).toBeNull();
  });

  it("hides delete from non-admins while retaining permitted edit and cancellation", () => {
    render(<SupplierBillHeaderActions bill={openBill} {...computeBillPermissions(openBill)} isAdmin={false}
      onEditClick={vi.fn()} onCancelClick={vi.fn()} onDeleteClick={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Eliminar" })).toBeNull();
    expect(screen.getByRole("button", { name: "Editar" })).not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("button", { name: "Cancelar registro" })).not.toHaveAttribute("aria-disabled");
  });

  it("keeps edit, cancellation and delete visible but explained when payments exist", () => {
    const bill = { ...openBill, status: "partial", payments: [{ id: "fixture-payment" }] };
    const callbacks = { onEditClick: vi.fn(), onCancelClick: vi.fn(), onDeleteClick: vi.fn() };
    render(<SupplierBillHeaderActions bill={bill} {...computeBillPermissions(bill)} isAdmin {...callbacks} />);
    for (const name of ["Editar", "Cancelar registro", "Eliminar"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).toHaveAttribute("data-block-code", "supplier_bill_has_payments");
      fireEvent.click(button);
    }
    for (const callback of Object.values(callbacks)) expect(callback).not.toHaveBeenCalled();
    expect(screen.getAllByRole("tooltip").length).toBeGreaterThan(0);
  });

  it.each([
    ["draft", "not_required", "supplier_bill_draft"],
    ["paid", "approved", "supplier_bill_paid"],
    ["cancelled", "not_required", "supplier_bill_cancelled"],
    ["pending", "pending", "supplier_bill_pending_approval"],
    ["pending", "rejected", "supplier_bill_rejected"],
  ])("retains the payment block for %s/%s", (status, approval_status, blockCode) => {
    const onPayClick = vi.fn();
    render(<SupplierBillPaymentActions bill={{ ...openBill, status, approval_status }} onPayClick={onPayClick} />);
    const button = screen.getByRole("button", { name: "Registrar pago" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAttribute("data-block-code", blockCode);
    fireEvent.click(button);
    expect(onPayClick).not.toHaveBeenCalled();
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("passes the live permitted payment button through its ref and invokes payment once", () => {
    const paymentTriggerRef = createRef<HTMLButtonElement>();
    const onPayClick = vi.fn();
    render(<SupplierBillPaymentActions bill={openBill} paymentTriggerRef={paymentTriggerRef} onPayClick={onPayClick} />);
    const button = screen.getByRole("button", { name: "Registrar pago" });
    expect(paymentTriggerRef.current).toBe(button);
    fireEvent.click(button);
    expect(onPayClick).toHaveBeenCalledTimes(1);
  });
});
