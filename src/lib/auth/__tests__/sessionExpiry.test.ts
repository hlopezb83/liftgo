import { notifyWarning } from "@/lib/ui/appFeedback";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({ signOut: vi.fn(async () => {}) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: sdk } }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyWarning: vi.fn() }));

describe("sesión vencida por ámbito", () => {
  beforeEach(() => { vi.resetModules(); sdk.signOut.mockClear(); });
  afterEach(() => vi.unstubAllGlobals());
  it("revokes and redirects even if optional feedback throws", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { pathname: "/bookings", search: "", assign } });
    vi.mocked(notifyWarning).mockImplementationOnce(() => { throw new Error("feedback unavailable"); });
    sdk.signOut.mockRejectedValueOnce(new Error("offline"));
    const { handleSessionExpired } = await import("../sessionExpiry");
    await expect(handleSessionExpired({ status: 401 })).resolves.toBe(true);
    expect(sdk.signOut).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledExactlyOnceWith("/login?redirect=%2Fbookings");
  });
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
  it.each([
    "Unauthorized: Invalid token",
    "Unauthorized: No authorization header provided",
    "Unauthorized: No token provided",
    "Unauthorized: No user ID found in token",
  ])("recupera una sesión rechazada por el servidor: %s", async (message) => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { pathname: "/quotes/quote-1", search: "", assign } });
    const { handleSessionExpired } = await import("../sessionExpiry");
    await expect(handleSessionExpired(new Error(message))).resolves.toBe(true);
    await expect(handleSessionExpired(new Error(message))).resolves.toBe(true);
    expect(sdk.signOut).toHaveBeenCalledOnce();
    expect(assign).toHaveBeenCalledExactlyOnceWith("/login?redirect=%2Fquotes%2Fquote-1");
  });
  it.each(["permission denied for table supplier_bills", "Failed to fetch", "Unauthorized: Only Bearer tokens are supported"])("no expulsa por otro fallo: %s", async (message) => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { pathname: "/quotes/quote-1", search: "", assign } });
    const { handleSessionExpired } = await import("../sessionExpiry");
    await expect(handleSessionExpired(new Error(message))).resolves.toBe(false);
    expect(sdk.signOut).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });
});
