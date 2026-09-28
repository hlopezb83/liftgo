import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));

import { useInvoicesWithBalance } from "../useInvoicesWithBalance";

describe("cartera con más de 1.000 facturas", () => {
  it("carga la página siguiente antes de entregar los totales y el CSV", async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({
      id: `inv-${index}`,
      invoice_number: `FAC-${index}`,
      status: "overdue",
      total: 100,
      paid_amount: 0,
      balance: 100,
      balance_mxn: 100,
      fx_missing: false,
      moneda: "MXN",
      due_date: "2026-09-01",
      issued_at: "2026-08-01",
    }));
    rpc.mockImplementation(async (_name, args: { p_offset: number; p_limit: number }) => ({
      data: rows.slice(args.p_offset, args.p_offset + args.p_limit),
      error: null,
    }));
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useInvoicesWithBalance({ statuses: ["overdue"] }), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.data).toHaveLength(1001));
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.map(([, args]) => args.p_offset)).toEqual([0, 1000]);
    expect(result.current.data?.reduce((total, row) => total + (row.balance_mxn ?? 0), 0)).toBe(100100);
  });
});
