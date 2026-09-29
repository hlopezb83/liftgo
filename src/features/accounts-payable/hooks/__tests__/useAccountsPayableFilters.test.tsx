import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { TestRouter } from "@/test/router";
import { describe, expect, it } from "vitest";
import { useAccountsPayableFilters } from "../useAccountsPayableFilters";
import type { SupplierBillListItem } from "../useSupplierBills";

const Wrapper = ({ children }: { children: ReactNode }) => (
  <TestRouter initialEntries={["/cuentas-por-pagar"]}>{children}</TestRouter>
);

describe("useAccountsPayableFilters", () => {
  it("busca facturas posteriores a las primeras 500 filas", async () => {
    const bills = Array.from({ length: 501 }, (_, index) => ({
      id: `bill-${index + 1}`,
      bill_number: `CXP-${String(index + 1).padStart(4, "0")}`,
      issue_date: "2026-09-01",
      supplier_id: "supplier-1",
      suppliers: { id: "supplier-1", name: "Proveedor Industrial" },
      status: "pending",
      category: "rent",
      approval_status: "approved",
      rep_summary: { pending: 0, received: 0, rejected: 0, total: 0, worst: "not_required" },
    } as unknown as SupplierBillListItem));

    const { result } = renderHook(() => useAccountsPayableFilters(bills), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.filtered).toHaveLength(501));

    act(() => result.current.set("search", "CXP-0501"));

    expect(result.current.filtered.map((bill) => bill.id)).toEqual(["bill-501"]);
  });
});
