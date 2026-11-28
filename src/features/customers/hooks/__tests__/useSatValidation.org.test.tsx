import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createSupabaseChainMock, type ChainCall } from "@/test/helpers/supabaseChain";
import { createQueryWrapper } from "@/test/helpers/queryClient";

type Relation = {
  customer_id: string;
  alias: string;
  razon_social: string;
  rfc: string;
  sat_validation_status: string;
  sat_validated_at: null;
  sat_validation_errors: never[];
  customers: { name: string };
};

const state = vi.hoisted(() => ({
  calls: [] as ChainCall[][],
  rows: [] as Relation[],
  failCount: false,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      organization_customers: (calls) => {
        state.calls.push(calls);
        const status = calls.find((call) => call.method === "eq" && call.args[0] === "sat_validation_status")?.args[1];
        if (status && state.failCount) return { data: null, count: null, error: { message: "count failed" } };
        const filtered = status
          ? state.rows.filter((row) => row.sat_validation_status === status)
          : state.rows;
        const range = calls.find((call) => call.method === "range")?.args as [number, number] | undefined;
        return {
          data: range ? filtered.slice(range[0], range[1] + 1) : [],
          count: filtered.length,
          error: null,
        };
      },
    },
  }),
}));

import { supabase } from "@/integrations/supabase/client";
import { useSatValidationOverview } from "../useSatValidation";

function makeRow(index: number, status = "valid"): Relation {
  return {
    customer_id: `customer-${String(index).padStart(4, "0")}`,
    alias: `Cliente local ${index}`,
    razon_social: `Razón social ${index}`,
    rfc: "LOC010101AAA",
    sat_validation_status: status,
    sat_validated_at: null,
    sat_validation_errors: [],
    customers: { name: "Identidad global" },
  };
}

describe("validación SAT por empresa", () => {
  it("consulta sólo la página visible y cuenta toda la cartera autorizada", async () => {
    state.calls.length = 0;
    state.failCount = false;
    state.rows = Array.from({ length: 1100 }, (_, index) =>
      makeRow(index, index === 1099 ? "not_validated" : "valid"),
    );
    vi.mocked(supabase.from).mockClear();
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useSatValidationOverview(2), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(vi.mocked(supabase.from).mock.calls.map(([table]) => table))
      .toEqual(Array(4).fill("organization_customers"));
    expect(state.calls.every((calls) => calls.some((call) =>
      call.method === "eq" && call.args[0] === "status" && call.args[1] === "active",
    ))).toBe(true);
    expect(state.calls.find((calls) => calls.some((call) => call.method === "range"))
      ?.find((call) => call.method === "range")?.args).toEqual([25, 49]);
    expect(result.current.data).toMatchObject({ total: 1100, pending: 1, mismatch: 0, error: 0 });
    expect(result.current.data?.rows).toHaveLength(25);
    expect(result.current.data?.rows[0]).toMatchObject({
      id: "customer-0025", name: "Cliente local 25", sat_validation_status: "valid",
    });
  });

  it("no presenta conteos parciales si falla un conteo exacto", async () => {
    state.calls.length = 0;
    state.rows = [makeRow(1, "not_validated")];
    state.failCount = true;
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useSatValidationOverview(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    state.failCount = false;
  });
});
