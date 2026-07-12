import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createSupabaseChainMock,
  type SupabaseMockResponse,
} from "@/test/helpers/supabaseChain";

let fromResp: SupabaseMockResponse = { data: [], error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({ fromResolver: () => fromResp }),
}));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));

import { useSupplierContacts } from "../useSupplierContacts";

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe("useSupplierContacts — RLS contract", () => {
  beforeEach(() => {
    fromResp = { data: [], error: null };
  });

  it("propaga permission denied cuando customer intenta leer contactos", async () => {
    fromResp = {
      data: null,
      error: { code: "42501", message: "permission denied for table supplier_contacts" },
    };
    const { result } = renderHook(() => useSupplierContacts("sup-1"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("staff recibe contactos con email y teléfono", async () => {
    fromResp = {
      data: [
        { id: "c1", supplier_id: "sup-1", name: "Juan", email: "j@p.com", phone: "555" },
      ],
      error: null,
    };
    const { result } = renderHook(() => useSupplierContacts("sup-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]).toMatchObject({ email: "j@p.com" });
  });
});
