import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const { useAuthMock, usePortalCustomerIdMock, scopeMock, eqMock, fromMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  usePortalCustomerIdMock: vi.fn(),
  scopeMock: vi.fn(),
  eqMock: vi.fn(),
  fromMock: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: useAuthMock }));
vi.mock("@/contexts/OrganizationContext", () => ({
  useVerifiedPortalCustomerId: usePortalCustomerIdMock,
}));
vi.mock("@/lib/query/useVerifiedIdentityScope", () => ({ useVerifiedIdentityScope: scopeMock }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: fromMock } }));

import * as facade from "../useCustomerPortal";
import * as queries from "../customerPortalQueries";
import { portalKeys } from "../../../lib/queryKeys";

const CUSTOMER_A = "c0000000-0000-4000-8000-00000000000a";

/** Paquete 5 (v8.25.7): la separación no debe alterar la API pública previa. */
const PUBLIC_HOOKS = [
  "usePortalCustomer",
  "usePortalBookings",
  "usePortalBookingsPage",
  "usePortalInvoices",
  "usePortalInvoice",
  "usePortalInvoicesPage",
  "usePortalContracts",
  "usePortalContractsPage",
  "usePortalPayments",
  "usePortalInvoicePayments",
] as const;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("fachada useCustomerPortal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ user: { id: "user-1" } });
    scopeMock.mockReturnValue("user-1:org-a:portal");
    usePortalCustomerIdMock.mockReturnValue(CUSTOMER_A);
    eqMock.mockReturnValue({
      maybeSingle: () => ({
        returns: () => Promise.resolve({ data: { id: CUSTOMER_A, name: "Cliente A" }, error: null }),
      }),
    });
    fromMock.mockReturnValue({ select: () => ({ eq: eqMock }) });
  });

  it("exporta todos los hooks públicos y son los del módulo de consultas", () => {
    for (const name of PUBLIC_HOOKS) {
      expect(typeof facade[name]).toBe("function");
      expect(facade[name]).toBe(queries[name]);
    }
    expect(Object.keys(facade).sort()).toEqual([...PUBLIC_HOOKS].sort());
  });

  it("usa el cliente verificado y la organización verificada en la clave", async () => {
    const { result } = renderHook(() => facade.usePortalCustomer(), { wrapper });

    await waitFor(() => expect(result.current.data?.id).toBe(CUSTOMER_A));
    expect(usePortalCustomerIdMock).toHaveBeenCalled();
    expect(scopeMock).toHaveBeenCalled();
    expect(eqMock).toHaveBeenCalledWith("id", CUSTOMER_A);
    expect(portalKeys.customer("user-1:org-a:portal")).not.toEqual(
      portalKeys.customer("user-1:org-b:portal"),
    );
  });

  it("sin organización verificada no consulta nada", async () => {
    scopeMock.mockReturnValue(null);
    const { result } = renderHook(() => facade.usePortalCustomer(), { wrapper });

    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(fromMock).not.toHaveBeenCalled();
  });
});
