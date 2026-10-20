import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ financial: true, userId: "admin-id", query: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: (options: unknown) => { state.query(options); return options; } }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: state.userId } }) }));
vi.mock("@/contexts/OrganizationContext", () => ({ useOrganizationContext: () => ({ status: "ready", organizationId: "org-a" }) }));
vi.mock("@/features/users", () => ({ useHasFinancialAccess: () => state.financial }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { useEntitySearch } from "../useEntitySearch";

beforeEach(() => { state.financial = true; state.userId = "admin-id"; state.query.mockClear(); });

describe("useEntitySearch — partición de permisos", () => {
  it("separa cache por identidad y exclusión financiera sin perder búsqueda operativa", () => {
    const { rerender } = renderHook(() => useEntitySearch("ACME", true));
    expect(state.query.mock.lastCall?.[0]).toMatchObject({
      queryKey: ["global-search", "org-a", "admin-id", true, "ACME"], enabled: true,
    });
    state.financial = false;
    state.userId = "dispatcher-id";
    rerender();
    expect(state.query.mock.lastCall?.[0]).toMatchObject({
      queryKey: ["global-search", "org-a", "dispatcher-id", false, "ACME"], enabled: true,
    });
    state.financial = true;
    rerender();
    expect(state.query.mock.lastCall?.[0]).toMatchObject({
      queryKey: ["global-search", "org-a", "dispatcher-id", true, "ACME"], enabled: true,
    });
  });
});
