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
  supabase: createSupabaseChainMock({ fromResolver: () => fromResp }),
}));

vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: vi.fn(),
}));

import { useSupplierBankAccounts } from "@/features/suppliers/hooks/useSupplierBankAccounts";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useSupplierBankAccounts — RLS contract", () => {
  beforeEach(() => {
    fromResp = { data: [], error: null };
  });

  it("propaga permission denied (42501) cuando customer intenta leer", async () => {
    fromResp = {
      data: null,
      error: { code: "42501", message: "permission denied for table supplier_bank_accounts" },
    };
    const { result } = renderHook(() => useSupplierBankAccounts("sup-1"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: "42501" });
  });

  it("staff (admin) recibe cuentas bancarias", async () => {
    fromResp = {
      data: [
        { id: "1", supplier_id: "sup-1", clabe: "012345678901234567", is_primary: true },
      ],
      error: null,
    };
    const { result } = renderHook(() => useSupplierBankAccounts("sup-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
  });

  it("no consulta cuando supplierId es undefined", async () => {
    const { result } = renderHook(() => useSupplierBankAccounts(undefined), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
  });
});
