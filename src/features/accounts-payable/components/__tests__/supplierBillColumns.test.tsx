import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { useSupplierBillColumns, renderSupplierBillMobileCard } from "../supplierBillColumns";
import type { SupplierBillListItem } from "../../hooks/useSupplierBills";

const bill = {
  id: "b-1",
  bill_number: "FP-0001",
  suppliers: { name: "Refacciones del Norte SA" },
  issue_date: "2026-01-01",
  due_date: "2026-02-01",
  total: 1000,
  balance: 500,
  currency: "MXN",
  status: "pending",
  approval_status: "not_required",
  category: null,
} as unknown as SupplierBillListItem;

describe("supplierBillColumns Untranslated wrapping", () => {
  it("marks bill_number and supplier name in columns", () => {
    const columns = useSupplierBillColumns();
    const billCol = columns.find((c) => c.id === "bill_number");
    const supplierCol = columns.find((c) => c.id === "supplier");
    if (typeof billCol?.cell !== "function" || typeof supplierCol?.cell !== "function") {
      throw new Error("missing cells");
    }
    const { container: c1 } = render(<>{billCol.cell({ row: { original: bill } } as never)}</>);
    const { container: c2 } = render(<>{supplierCol.cell({ row: { original: bill } } as never)}</>);
    expect(c1.querySelector('[translate="no"]')?.textContent).toContain("FP-0001");
    expect(c2.querySelector('[translate="no"]')?.textContent).toContain("Refacciones del Norte");
  });

  it("marks bill_number and supplier name in the mobile card", () => {
    const { container } = render(<>{renderSupplierBillMobileCard(bill, () => {})}</>);
    const nodes = container.querySelectorAll('[translate="no"]');
    const texts = Array.from(nodes).map((n) => n.textContent);
    expect(texts.some((t) => t?.includes("FP-0001"))).toBe(true);
    expect(texts.some((t) => t?.includes("Refacciones del Norte"))).toBe(true);
  });
});
