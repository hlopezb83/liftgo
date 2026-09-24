import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({
  role: "auditor",
  userId: "user-1",
  organizationId: "org-1",
  rpc: vi.fn(async () => ({ data: { maintenance_open: 2 }, error: null })),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: context.userId } }),
}));
vi.mock("@/contexts/OrganizationContext", () => ({
  useVerifiedOrganizationId: () => context.organizationId,
}));
vi.mock("@/features/users", () => ({
  useUserRole: () => ({ data: context.role }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: context.rpc },
}));

import { useSidebarBadgeCounts } from "./useSidebarBadgeCounts";

describe("contadores del menú", () => {
  let queryClient: QueryClient;
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    context.role = "auditor";
    context.userId = "user-1";
    context.organizationId = "org-1";
    context.rpc.mockClear();
  });

  it("no consulta métricas internas para el auditor", () => {
    const { result } = renderHook(() => useSidebarBadgeCounts(), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(context.rpc).not.toHaveBeenCalled();
  });

  it("separa los contadores por empresa y usuario", async () => {
    context.role = "ventas";
    const { rerender } = renderHook(() => useSidebarBadgeCounts(), { wrapper });
    await waitFor(() => expect(context.rpc).toHaveBeenCalledTimes(1));

    context.organizationId = "org-2";
    rerender();
    await waitFor(() => expect(context.rpc).toHaveBeenCalledTimes(2));

    context.userId = "user-2";
    rerender();
    await waitFor(() => expect(context.rpc).toHaveBeenCalledTimes(3));
  });
});
