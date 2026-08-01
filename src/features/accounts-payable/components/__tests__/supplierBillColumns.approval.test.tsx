import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useSupplierBillColumns } from "../supplierBillColumns";

const base = {
  id: "b-1",
  bill_number: "CXP-0001",
  suppliers: { name: "Refacciones del Norte" },
  issue_date: "2026-01-05",
  due_date: "2026-02-05",
  total: 1000,
  balance: 0,
  currency: "MXN",
  status: "paid",
  approval_status: "pending",
  category: null,
};

function ApprovalCell({ bill }: { bill: Record<string, unknown> }) {
  const columns = useSupplierBillColumns();
  const col = columns.find((c) => c.id === "approval_status");
  if (typeof col?.cell !== "function") throw new Error("missing approval cell");
  return <>{col.cell({ row: { original: bill } } as never)}</>;
}

function renderApproval(bill: Record<string, unknown>) {
  return render(<ApprovalCell bill={bill} />);
}


describe("supplierBillColumns — aprobación (R9-P2-02)", () => {
  it("no muestra 'Por aprobar' en una factura pagada", () => {
    const { container } = renderApproval({ ...base, status: "paid" });
    expect(container.textContent).toBe("—");
  });

  it("no muestra 'Por aprobar' en una factura cancelada", () => {
    const { container } = renderApproval({ ...base, status: "cancelled" });
    expect(container.textContent).toBe("—");
  });

  it("sigue mostrando 'Por aprobar' en una factura abierta", () => {
    const { container } = renderApproval({ ...base, status: "pending", balance: 1000 });
    expect(container.textContent).not.toBe("—");
    expect(container.textContent).toMatch(/aprob/i);
  });

  it("muestra el estado aprobado aunque la factura ya esté pagada", () => {
    const { container } = renderApproval({ ...base, status: "paid", approval_status: "approved" });
    expect(container.textContent).not.toBe("—");
  });

  it("muestra guion cuando la aprobación no aplica", () => {
    const { container } = renderApproval({ ...base, approval_status: "not_required" });
    expect(container.textContent).toBe("—");
  });
});
