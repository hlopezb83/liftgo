import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createSupabaseChainMock, type ChainCall } from "@/test/helpers/supabaseChain";
import { createQueryWrapper } from "@/test/helpers/queryClient";

const state = vi.hoisted(() => ({ calls: [] as ChainCall[][] }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      organization_customers: (calls) => {
        state.calls.push(calls);
        return { data: [{
          customer_id: "shared-customer", alias: "Cliente local",
          razon_social: "Razón social local", rfc: "LOC010101AAA",
          sat_validation_status: "not_validated", sat_validated_at: null,
          sat_validation_errors: [], customers: { name: "Identidad global" },
        }], error: null };
      },
    },
  }),
}));

import { supabase } from "@/integrations/supabase/client";
import { useSatValidationOverview } from "../useSatValidation";

describe("validación SAT por empresa", () => {
  it("lee ficha y resultado de la relación local", async () => {
    state.calls.length = 0;
    vi.mocked(supabase.from).mockClear();
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useSatValidationOverview(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(vi.mocked(supabase.from).mock.calls.map(([table]) => table))
      .toEqual(["organization_customers"]);
    expect(state.calls[0].filter((call) => call.method === "eq").map((call) => call.args))
      .toContainEqual(["status", "active"]);
    expect(result.current.data?.[0]).toMatchObject({
      id: "shared-customer", name: "Cliente local",
      razon_social: "Razón social local", rfc: "LOC010101AAA",
      sat_validation_status: "not_validated",
    });
  });
});
