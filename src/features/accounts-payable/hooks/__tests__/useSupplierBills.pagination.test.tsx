import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  ranges: { supplier_bills: [] as number[], supplier_payments: [] as number[] },
  rows: {
    supplier_bills: [] as Array<Record<string, unknown>>,
    supplier_payments: [] as Array<Record<string, unknown>>,
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: supabaseMock.from },
}));

import { useSupplierBills } from "../useSupplierBills";

function createPagedQuery(table: "supplier_bills" | "supplier_payments") {
  const builder: Record<string, unknown> = {};
  let pageStart = 0;
  let pageEnd = -1;
  builder.select = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.range = vi.fn((from: number, to: number) => {
    pageStart = from;
    pageEnd = to;
    supabaseMock.ranges[table].push(from);
    return builder;
  });
  builder.returns = vi.fn(async () => ({
    data: supabaseMock.rows[table].slice(pageStart, pageEnd + 1),
    error: null,
  }));
  return builder;
}

describe("useSupplierBills pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMock.ranges.supplier_bills = [];
    supabaseMock.ranges.supplier_payments = [];
    supabaseMock.rows.supplier_bills = Array.from({ length: 1_001 }, (_, index) => ({
      id: `bill-${index}`,
      bill_number: `CXP-${index}`,
      issue_date: "2026-09-01",
      balance: 100,
      total: 100,
      currency: "MXN",
      status: "pending",
      approval_status: "not_required",
      supplier_id: "supplier-1",
      suppliers: { id: "supplier-1", name: "Proveedor" },
    }));
    supabaseMock.rows.supplier_payments = Array.from({ length: 501 }, (_, index) => ({
      id: `payment-${index}`,
      bill_id: `bill-${index}`,
      rep_required: false,
      rep_status: "not_required",
      payment_date: "2026-09-01",
      amount: 10,
    }));
    supabaseMock.from.mockImplementation((table: "supplier_bills" | "supplier_payments") =>
      createPagedQuery(table)
    );
  });

  it("loads every bill and payment page before returning dashboard data", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useSupplierBills(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.data).toHaveLength(1_001));

    expect(supabaseMock.ranges.supplier_bills).toEqual([0, 500, 1_000]);
    expect(supabaseMock.ranges.supplier_payments).toEqual([0, 500]);
    expect(result.current.data?.[500].payments).toHaveLength(1);
    expect(result.current.data?.[1_000].payments).toHaveLength(0);
  });
});
