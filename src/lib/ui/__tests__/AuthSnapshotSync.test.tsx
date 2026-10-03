import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: { id: "actor-a", email: "admin@example.com" } as { id: string; email: string } | null, org: "org-a" as string | undefined }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("@/contexts/OrganizationContext", () => ({ useVerifiedOrganizationId: () => state.org }));
vi.mock("@/features/users/hooks/useUserRole", () => ({ useUserRole: () => ({ data: "admin" }) }));
vi.mock("@/lib/observability/sentry", () => ({ Sentry: { setUser: vi.fn(), setTag: vi.fn() } }));
import { AuthSnapshotSync } from "@/features/users/components/AuthSnapshotSync";
import { companySettingsQueries } from "@/features/company-settings/lib/queryKeys";
import { getAuthSnapshot } from "../authSnapshot";

afterEach(() => { vi.unstubAllGlobals(); state.user = { id: "actor-a", email: "admin@example.com" }; state.org = "org-a"; });

describe("identidad del diagnóstico", () => {
  it("usa la empresa verificada y el nombre ya cargado, sin consultar nuevas filas", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: "8.43.1" }) });
    vi.stubGlobal("fetch", fetch);
    const cache = new QueryClient();
    cache.setQueryData(["sidebar-organization-name", "org-b"], "Otra empresa");
    const view = render(<QueryClientProvider client={cache}><AuthSnapshotSync /></QueryClientProvider>);
    expect(getAuthSnapshot().organization?.id).toBe("org-a");
    expect(getAuthSnapshot().organization?.name).toBe("");
    cache.setQueryData(["sidebar-organization-name", "org-a"], "ELOGISTIX SHIPPING");
    await waitFor(() => expect(getAuthSnapshot().organization?.name).toBe("ELOGISTIX SHIPPING"));
    cache.setQueryData(companySettingsQueries.keys.lists(), { razon_social: "ELOGISTIX SHIPPING" });
    await waitFor(() => expect(getAuthSnapshot().organization?.name).toBe("ELOGISTIX SHIPPING"));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith("/version.json", { cache: "no-store" });
    view.unmount();
    expect(getAuthSnapshot()).toEqual({ user: null, organization: null, role: null });
  });
});
