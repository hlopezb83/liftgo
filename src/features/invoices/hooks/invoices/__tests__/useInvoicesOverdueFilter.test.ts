import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import {
  createSupabaseChainMock,
  type ChainCall,
  type SupabaseMockResponse,
} from "@/test/helpers/supabaseChain";

let capturedCalls: ChainCall[] = [];
let resp: SupabaseMockResponse = { data: [], error: null };

// R8-FE-01 (BL-R8-04): el tab "Vencido" debe incluir status='overdue' y
// excluir cancelaciones aceptadas, igual que v_overdue_invoices / get_dashboard_stats.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      invoices: (calls) => {
        capturedCalls = calls;
        return resp;
      },
    },
  }),
}));

import { useInvoices } from "../useInvoices";

describe("useInvoices — filtro de vencidas (R8-FE-01)", () => {
  beforeEach(() => {
    capturedCalls = [];
    resp = { data: [], error: null };
  });

  it("incluye status='overdue' además de sent/partial", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useInvoices({ status: "overdue" }), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const inCall = capturedCalls.find((c) => c.method === "in" && c.args[0] === "status");
    expect(inCall?.args[1]).toEqual(["sent", "partial", "overdue"]);
  });

  it("excluye cancelaciones aceptadas vía filtro .or de cancellation_status", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useInvoices({ status: "overdue" }), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const orCalls = capturedCalls.filter((c) => c.method === "or");
    const cancellationOr = orCalls.find((c) =>
      typeof c.args[0] === "string" && (c.args[0] as string).includes("cancellation_status"),
    );
    expect(cancellationOr?.args[0]).toBe(
      "cancellation_status.is.null,cancellation_status.neq.accepted",
    );
  });

  it("no aplica el filtro de vencidas cuando status es distinto de overdue", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useInvoices({ status: "paid" }), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const eqCall = capturedCalls.find((c) => c.method === "eq" && c.args[0] === "status");
    expect(eqCall?.args[1]).toBe("paid");
  });
});
