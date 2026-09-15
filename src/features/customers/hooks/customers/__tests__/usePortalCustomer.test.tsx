import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const { useAuthMock, usePortalCustomerIdMock, eqMock, fromMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  usePortalCustomerIdMock: vi.fn(),
  eqMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: useAuthMock }));
vi.mock("@/contexts/OrganizationContext", () => ({
  useVerifiedPortalCustomerId: usePortalCustomerIdMock,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: fromMock } }));

import { usePortalCustomer } from "../useCustomerPortal";

const CUSTOMER_A = "c0000000-0000-4000-8000-00000000000a";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("usePortalCustomer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ user: { id: "user-1" } });
    eqMock.mockReturnValue({
      maybeSingle: () => ({
        returns: () => Promise.resolve({ data: { id: CUSTOMER_A, name: "Cliente A" }, error: null }),
      }),
    });
    fromMock.mockReturnValue({ select: () => ({ eq: eqMock }) });
  });

  it("consulta al cliente verificado por ID, sin tomar el primer registro visible", async () => {
    usePortalCustomerIdMock.mockReturnValue(CUSTOMER_A);
    const { result } = renderHook(() => usePortalCustomer(), { wrapper });

    await waitFor(() => expect(result.current.data?.id).toBe(CUSTOMER_A));
    expect(fromMock).toHaveBeenCalledWith("customers");
    expect(eqMock).toHaveBeenCalledWith("id", CUSTOMER_A);
  });

  it("sin cliente de portal verificado no consulta nada", async () => {
    usePortalCustomerIdMock.mockReturnValue(undefined);
    const { result } = renderHook(() => usePortalCustomer(), { wrapper });

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(fromMock).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });
});
