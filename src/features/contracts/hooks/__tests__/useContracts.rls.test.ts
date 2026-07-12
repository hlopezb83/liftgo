import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import {
  createSupabaseChainMock,
  type SupabaseMockResponse,
} from "@/test/helpers/supabaseChain";

let resp: SupabaseMockResponse = { data: [], error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: { contracts: () => resp },
  }),
}));

import { useContracts } from "../useContracts";

describe("useContracts — RLS contract", () => {
  beforeEach(() => {
    resp = { data: [], error: null };
  });

  it("propaga permission denied", async () => {
    resp = {
      data: null,
      error: { code: "42501", message: "permission denied for table contracts" },
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useContracts(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("mapea join customers/forklifts cuando hay acceso", async () => {
    resp = {
      data: [
        {
          id: "c-1",
          contract_number: "CTR-0001",
          customers: { name: "ACME" },
          forklifts: { name: "F-1" },
        },
      ],
      error: null,
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useContracts(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]).toMatchObject({
      customer_name: "ACME",
      forklift_name: "F-1",
    });
  });
});
