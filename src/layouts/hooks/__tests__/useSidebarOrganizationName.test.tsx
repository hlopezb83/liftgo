import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSidebarOrganizationName } from "../useSidebarOrganizationName";

const state = vi.hoisted(() => ({ organizationId: "org-a" as string | undefined, rpc: vi.fn() }));
vi.mock("@/contexts/OrganizationContext", () => ({ useVerifiedOrganizationId: () => state.organizationId }));
vi.mock("@/lib/rpc", () => ({ callRpc: state.rpc }));
function renderIdentity() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useSidebarOrganizationName(), {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
}
beforeEach(() => { state.organizationId = "org-a"; state.rpc.mockReset(); });

describe("Identidad mínima para sidebar", () => {
  it("usa una RPC sin empresa suministrada por el navegador ni lectura fiscal", async () => {
    state.rpc.mockResolvedValue("ELOGISTIX SHIPPING");
    const { result } = renderIdentity();
    await waitFor(() => expect(result.current.data).toBe("ELOGISTIX SHIPPING"));
    expect(state.rpc).toHaveBeenCalledWith("get_organization_display_name");
  });

  it("no consulta ni usa identidad almacenada mientras la empresa no está verificada", () => {
    state.organizationId = undefined;
    const { result } = renderIdentity();
    expect(result.current.data).toBeUndefined();
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("no arrastra el nombre anterior al cambiar el contexto verificado", async () => {
    state.rpc.mockResolvedValueOnce("Empresa A").mockResolvedValueOnce("Empresa B");
    const { result, rerender } = renderIdentity();
    await waitFor(() => expect(result.current.data).toBe("Empresa A"));
    state.organizationId = "org-b";
    rerender();
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.data).toBe("Empresa B"));
    expect(state.rpc).toHaveBeenCalledTimes(2);
  });
});
