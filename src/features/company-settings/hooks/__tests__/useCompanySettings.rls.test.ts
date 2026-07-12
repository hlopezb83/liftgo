import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createSupabaseChainMock,
  type SupabaseMockResponse,
} from "@/test/helpers/supabaseChain";

let fromResp: SupabaseMockResponse = { data: null, error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({ fromResolver: () => fromResp }),
}));

import { useCompanySettings } from "../useCompanySettings";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useCompanySettings — RLS contract (post v5.81.4)", () => {
  beforeEach(() => {
    fromResp = { data: null, error: null };
  });

  it("mecánico recibe permission denied (sin acceso a config fiscal)", async () => {
    fromResp = {
      data: null,
      error: { code: "42501", message: "permission denied for table company_settings" },
    };
    const { result } = renderHook(() => useCompanySettings(), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("staff recibe configuración fiscal completa", async () => {
    fromResp = {
      data: { id: "cs-1", rfc: "ABC010101AAA", razon_social: "LiftGo SA", regimen_fiscal: "601" },
      error: null,
    };
    const { result } = renderHook(() => useCompanySettings(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ rfc: "ABC010101AAA" });
  });
});
