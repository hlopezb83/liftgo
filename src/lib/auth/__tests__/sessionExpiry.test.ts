import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ signOut: vi.fn(async () => {}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: sdk } }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyWarning: vi.fn() }));

describe("sesión vencida por ámbito", () => {
  beforeEach(() => { vi.resetModules(); sdk.signOut.mockClear(); });
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    ["/platform", "", "/platform/login?next=%2Fplatform"],
    ["/platform/organizations", "?page=2", "/platform/login?next=%2Fplatform%2Forganizations"],
    ["/bookings", "?status=confirmed", "/login?redirect=%2Fbookings%3Fstatus%3Dconfirmed"],
    ["/platformish", "", "/login?redirect=%2Fplatformish"],
  ])("%s conserva su pantalla de acceso", async (pathname, search, target) => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { pathname, search, assign } });
    const { handleSessionExpired } = await import("../sessionExpiry");
    await expect(handleSessionExpired({ status: 401 })).resolves.toBe(true);
    expect(sdk.signOut).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledExactlyOnceWith(target);
  });
  it.each(["/login", "/auth", "/platform/login"])("%s no entra en un bucle de expulsión", async (pathname) => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { pathname, search: "", assign } });
    const { handleSessionExpired } = await import("../sessionExpiry");
    await handleSessionExpired({ status: 401 });
    expect(sdk.signOut).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});
