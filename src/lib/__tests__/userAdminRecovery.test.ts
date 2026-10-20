import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRecoveryRedirect } from "../server/recoveryRedirect.server";

const state = vi.hoisted(() => ({
  guard: vi.fn(), organization: vi.fn(), rateLimit: vi.fn(),
  createUser: vi.fn(), generateLink: vi.fn(), getUserById: vi.fn(), rpc: vi.fn(),
  profile: vi.fn(), finalize: vi.fn(), assertTarget: vi.fn(), validate: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const builder = { middleware: () => builder, validator: () => builder, handler: (handler: unknown) => handler };
  return builder;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("../server/adminGuards.server", async () => {
  const { HttpError } = await import("../server/guards/httpError");
  return {
    HttpError, requireAdmin: state.guard, requireInternalOrganization: state.organization,
    enforceRateLimit: state.rateLimit, generateSecurePassword: () => "Synthetic-Only-Password-123!",
  };
});
vi.mock("../userAdmin.helpers", () => ({
  validateInviteInput: state.validate, finalizeInvitedUser: state.finalize,
  assertResettableTarget: state.assertTarget, assertNotLastActiveAdmin: vi.fn(),
}));
import { inviteUserFn, resetUserPasswordFn } from "../userAdmin.functions";

type Handler = (input: { data: Record<string, unknown>; context: { userId: string; supabase: object } }) => Promise<unknown>;
const invite = inviteUserFn as unknown as Handler;
const reset = resetUserPasswordFn as unknown as Handler;
const context = { userId: "synthetic-admin", supabase: {} };
const inviteData = { email: "new-user@example.test", full_name: "Synthetic User", role: "operator" };
const admin = {
  auth: { admin: { createUser: state.createUser, generateLink: state.generateLink, getUserById: state.getUserById } },
  rpc: state.rpc,
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: state.profile }) }) }),
};

describe("server-owned administrative recovery destination", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("PORTAL_SITE_URL", undefined);
    state.guard.mockResolvedValue({ admin });
    state.organization.mockResolvedValue("synthetic-organization");
    state.profile.mockResolvedValue({ data: null });
    state.createUser.mockResolvedValue({ data: { user: { id: "synthetic-target" } }, error: null });
    state.getUserById.mockResolvedValue({ data: { user: { email: inviteData.email } }, error: null });
    state.generateLink.mockResolvedValue({ data: { properties: { action_link: "https://example.test/synthetic-link" } }, error: null });
    state.rpc.mockResolvedValue({ error: null });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("uses the published portal fallback with the explicit recovery marker", () => {
    expect(getRecoveryRedirect()).toBe("https://liftgo.lovable.app/auth?type=recovery");
  });
  it.each(["https://staging.example.test", "https://staging.example.test/", "https://staging.example.test/ignored?query=yes#hash"])("uses only the trusted configured origin: %s", (site) => {
    vi.stubEnv("PORTAL_SITE_URL", site);
    expect(getRecoveryRedirect()).toBe("https://staging.example.test/auth?type=recovery");
  });
  it("supports the configured local development origin", () => {
    vi.stubEnv("PORTAL_SITE_URL", "http://localhost:3000");
    expect(getRecoveryRedirect()).toBe("http://localhost:3000/auth?type=recovery");
  });
  it.each(["", "not-a-url", "javascript:alert(1)", "https://user:password@example.test"])("fails closed for invalid server configuration: %s", (site) => {
    vi.stubEnv("PORTAL_SITE_URL", site);
    expect(getRecoveryRedirect).toThrow();
  });
  it.each(["invite", "reset"])("passes the server destination to %s, ignoring forged client values", async (flow) => {
    vi.stubEnv("PORTAL_SITE_URL", "https://staging.example.test/");
    const forged = { origin: "https://attacker.example", redirectTo: "https://attacker.example", options: { redirectTo: "https://attacker.example" } };
    await (flow === "invite" ? invite : reset)({ data: { ...inviteData, user_id: "synthetic-target", ...forged }, context });
    expect(state.generateLink).toHaveBeenCalledExactlyOnceWith({
      type: "recovery", email: inviteData.email,
      options: { redirectTo: "https://staging.example.test/auth?type=recovery" },
    });
  });
  it("does not generate a recovery link when the administrator sets a password", async () => {
    vi.stubEnv("PORTAL_SITE_URL", "invalid");
    await invite({ data: { ...inviteData, password: "Synthetic-Manual-Password-123!" }, context });
    expect(state.generateLink).not.toHaveBeenCalled();
  });
  it("validates configuration before creating an invited user", async () => {
    vi.stubEnv("PORTAL_SITE_URL", "invalid");
    await expect(invite({ data: inviteData, context })).rejects.toThrow();
    expect(state.createUser).not.toHaveBeenCalled();
    expect(state.generateLink).not.toHaveBeenCalled();
  });
  it("does not generate a reset link or revoke sessions when configuration is invalid", async () => {
    vi.stubEnv("PORTAL_SITE_URL", "invalid");
    await expect(reset({ data: { user_id: "synthetic-target" }, context })).rejects.toThrow();
    expect(state.generateLink).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
