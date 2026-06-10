import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import {
  createSupabaseChainMock,
  type SupabaseMockResponse,
} from "@/test/helpers/supabaseChain";

let fromResp: SupabaseMockResponse = { data: [], error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    fromResolver: () => fromResp,
    storageSignedUrl: async () => ({ data: { signedUrl: "https://signed/url" } }),
  }),
}));

import { useDocuments } from "@/hooks/useDocuments";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useDocuments — RLS contract", () => {
  beforeEach(() => {
    fromResp = { data: [], error: null };
  });

  it("propaga permission denied del bucket / tabla documents", async () => {
    fromResp = {
      data: null,
      error: { code: "42501", message: "permission denied for table documents" },
    };
    const { result } = renderHook(() => useDocuments("forklift", "f-1"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("staff recibe documentos con signed URL inyectada", async () => {
    fromResp = {
      data: [
        { id: "d1", entity_type: "forklift", entity_id: "f-1", file_url: "https://x.com/documents/path/a.pdf" },
      ],
      error: null,
    };
    const { result } = renderHook(() => useDocuments("forklift", "f-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].file_url).toBe("https://signed/url");
  });

  it("no consulta si entityId es undefined", async () => {
    const { result } = renderHook(() => useDocuments("forklift", undefined), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
  });
});
