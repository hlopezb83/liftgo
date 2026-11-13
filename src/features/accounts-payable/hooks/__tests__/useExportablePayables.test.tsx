import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";

const state = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("http://127.0.0.1:54321", "offline", {
    auth: { persistSession: false },
    global: { fetch: (...args: Parameters<typeof fetch>) => state.fetch(...args) },
  }) };
});
vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: vi.fn(), notifySuccess: vi.fn(),
}));

import { useExportablePayables } from "../useExportablePayables";
import { usePaymentSelection } from "../usePaymentSelection";
import { useCancelSupplierBill } from "../useSupplierBillMutations";

function bill(id: string, status: string, approval_status = "approved", balance = 116) {
  return {
    id, status, approval_status, balance, bill_number: id, supplier_id: "supplier-1",
    due_date: "2026-11-30", currency: "MXN", exchange_rate: 1, description: null,
    payment_in_progress_at: null, suppliers: { name: "Proveedor", rfc: null },
  };
}
let bills: ReturnType<typeof bill>[];
const json = (data: unknown) => new Response(JSON.stringify(data), {
  headers: { "content-type": "application/json" },
});

beforeEach(() => {
  bills = [
    bill("approved", "pending"), bill("not-required", "partial", "not_required"),
    bill("cancelled", "cancelled"), bill("draft", "draft"),
    bill("awaiting-approval", "pending", "pending"), bill("paid", "paid", "approved", 0),
  ];
  state.fetch.mockReset().mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.pathname.endsWith("/supplier_payments") && init?.method === "HEAD") {
      return new Response(null, { headers: { "content-range": "*/0" } });
    }
    if (url.pathname.endsWith("/supplier_bank_accounts")) {
      return json([{
        supplier_id: "supplier-1", bank_name: "Banco", clabe: "012345678901234568",
        account_number: null, account_holder: "Proveedor", is_primary: true, created_at: "2026-11-01",
      }]);
    }
    if (url.pathname.endsWith("/supplier_bills")) {
      if (init?.method === "PATCH") {
        const row = bills.find(value => `eq.${value.id}` === url.searchParams.get("id"));
        if (!row) return json([]);
        Object.assign(row, JSON.parse(String(init.body)));
        expect(url.searchParams.get("select")).toBe("id");
        return json([{ id: row.id }]);
      }
      const excludedStatuses = url.searchParams.getAll("status").map(value => value.replace(/^neq\./, ""));
      const approvals = url.searchParams.get("approval_status")?.slice(4, -1).split(",") ?? [];
      const minimumBalance = Number(url.searchParams.get("balance")?.replace(/^gt\./, ""));
      const eligible = bills.filter(value => !excludedStatuses.includes(value.status)
        && approvals.includes(value.approval_status) && value.balance > minimumBalance);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      return json(eligible.slice(offset, offset + Number(url.searchParams.get("limit"))));
    }
    throw new Error(`Unexpected offline request: ${url.pathname}`);
  });
});

describe("payable eligibility for payment batches", () => {
  it("selects approved payable balances without offering cancelled bills, drafts or bills awaiting approval", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => {
      const query = useExportablePayables();
      return { query, selection: usePaymentSelection(true, query.data) };
    }, { wrapper: Wrapper });
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    expect(result.current.query.data?.map(value => value.id)).toEqual(["approved", "not-required"]);
    expect(result.current.selection.selected.map(value => value.id)).toEqual(["approved", "not-required"]);
  });

  it("removes a cancelled bill from a fresh cached export list immediately after confirmation", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => ({
      query: useExportablePayables(), cancel: useCancelSupplierBill(),
    }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.query.data).toHaveLength(2));
    await act(async () => {
      await result.current.cancel.mutateAsync({ id: "approved", reason: "Duplicada" });
    });
    await waitFor(() => expect(result.current.query.data?.map(value => value.id)).toEqual(["not-required"]));
    expect(result.current.cancel.isSuccess).toBe(true);
  });
});
