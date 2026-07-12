import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import {
  createSupabaseChainMock,
  type SupabaseMockResponse,
} from "@/test/helpers/supabaseChain";

let resp: SupabaseMockResponse = { data: [], error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({ fromResolver: () => resp }),
}));

import { useCustomers } from "../useCustomers";

describe("useCustomers — RLS contract", () => {
  beforeEach(() => {
    resp = { data: [], error: null };
  });

  it("propaga permission denied del backend", async () => {
    resp = {
      data: null,
      error: { code: "42501", message: "permission denied for table customers" },
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCustomers(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("lista vacia cuando RLS oculta todo", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCustomers(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
