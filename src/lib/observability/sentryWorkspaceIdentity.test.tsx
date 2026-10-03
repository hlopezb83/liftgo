import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import * as Sentry from "@sentry/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlatformGuard } from "@/features/platform/components/PlatformGuard";
import { AuthSnapshotSync } from "@/features/users/components/AuthSnapshotSync";
import { AuthQueryCacheSync } from "@/lib/ui/AuthQueryCacheSync";
import { getAuthSnapshot } from "@/lib/ui/authSnapshot";
import { clearSentryIdentity } from "./identity";

const state = vi.hoisted(() => ({ user: { id: "actor-a", email: "audit@example.com" } as { id: string; email: string } | null }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user, isLoading: false, signOut: vi.fn() }) }));
vi.mock("@/contexts/OrganizationContext", () => ({ useVerifiedOrganizationId: () => state.user ? "org-a" : undefined }));
vi.mock("@/features/users/hooks/useUserRole", () => ({ useUserRole: () => ({ data: state.user ? "admin" : null }) }));
vi.mock("@/features/auth", () => ({ useRecoveryStatus: () => "idle" }));
vi.mock("@/features/platform/hooks/usePlatformAccess", async (original) => ({
  ...await original<typeof import("@/features/platform/hooks/usePlatformAccess")>(),
  usePlatformAccessStatus: () => ({ data: { isOperator: true, profile: "root", revision: "1", capabilities: [] }, isPending: false, isError: false }),
}));
vi.mock("@/lib/router-compat", () => ({ useLocation: () => ({ pathname: "/platform" }) }));
vi.mock("@/lib/router-compat-ui", () => ({ Navigate: () => null, Link: () => null }));

afterEach(() => { clearSentryIdentity(); state.user = { id: "actor-a", email: "audit@example.com" }; vi.unstubAllGlobals(); });

describe("propiedad del contexto al cambiar de espacio", () => {
  it("el desmontaje tardío de plataforma conserva la identidad empresarial nueva", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: "test" }) }));
    const cache = new QueryClient();
    const tree = (platform: boolean) => <QueryClientProvider client={cache}>
      {platform && <PlatformGuard key="platform"><span>Plataforma</span></PlatformGuard>}
      <AuthSnapshotSync key="organization" />
    </QueryClientProvider>;
    const view = render(tree(true));
    expect(Sentry.getIsolationScope().getScopeData().tags.organization_id).toBe("org-a");
    view.rerender(tree(false));
    expect(Sentry.getIsolationScope().getScopeData().tags.organization_id).toBe("org-a");
    expect(Sentry.getIsolationScope().getScopeData().user.id).toBe("actor-a");
    expect(getAuthSnapshot().organization?.id).toBe("org-a");
    view.unmount();
    expect(Sentry.getIsolationScope().getScopeData().user.id).toBeUndefined();
  });

  it("la purga de caché posterior no borra una identidad recién sincronizada", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: "test" }) }));
    const cache = new QueryClient();
    const tree = () => <QueryClientProvider client={cache}>
      <AuthSnapshotSync />
      <AuthQueryCacheSync />
    </QueryClientProvider>;
    state.user = null;
    const view = render(tree());
    state.user = { id: "actor-b", email: "audit-b@example.com" };
    view.rerender(tree());
    expect(Sentry.getIsolationScope().getScopeData().user.id).toBe("actor-b");
    expect(Sentry.getIsolationScope().getScopeData().tags.organization_id).toBe("org-a");
    expect(getAuthSnapshot().user?.id).toBe("actor-b");
    state.user = null;
    view.rerender(tree());
    expect(Sentry.getIsolationScope().getScopeData().user.id).toBeUndefined();
    expect(getAuthSnapshot().user).toBeNull();
  });
});
