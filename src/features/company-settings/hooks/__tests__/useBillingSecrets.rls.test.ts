import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createSupabaseChainMock,
  type SupabaseMockResponse,
} from "@/test/helpers/supabaseChain";

let rpcResp: SupabaseMockResponse = { data: null, error: null };
const fromSpy = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const base = createSupabaseChainMock({ rpcResolver: () => rpcResp });
  return {
    supabase: {
      ...base,
      from: (table: string) => {
        fromSpy(table);
        return base.from(table);
      },
    },
  };
});

import { useBillingSecrets } from "../useBillingSecrets";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useBillingSecrets — solo flags vía RPC, nunca columnas crudas", () => {
  beforeEach(() => {
    rpcResp = { data: null, error: null };
    fromSpy.mockClear();
  });

  it("usa RPC get_billing_secrets_status y NO accede a la tabla billing_secrets", async () => {
    rpcResp = {
      data: [{ id: "bs-1", has_test_key: true, has_live_key: false }],
      error: null,
    };
    const { result } = renderHook(() => useBillingSecrets(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      id: "bs-1",
      has_test_key: true,
      has_live_key: false,
    });
    expect(fromSpy).not.toHaveBeenCalledWith("billing_secrets");
  });

  it("devuelve flags en false cuando la RPC no encuentra config", async () => {
    rpcResp = { data: [], error: null };
    const { result } = renderHook(() => useBillingSecrets(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      id: null,
      has_test_key: false,
      has_live_key: false,
    });
  });
});
