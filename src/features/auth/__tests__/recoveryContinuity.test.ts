import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeRecovery, getRecoveryIdentityKey, getRecoveryStatus, getRecoveryUserId, initRecoveryFromLocation, resetRecoveryForTests } from "../recoverySession";
import { RECOVERY_STORAGE_KEY, resetRecoveryPersistenceForTests, type RecoveryAuthSession } from "../recoveryPersistence";

const h = vi.hoisted(() => ({ listener: null as null | ((event: string, session: RecoveryAuthSession) => void) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { onAuthStateChange: vi.fn((cb) => {
    h.listener = cb;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  }) } },
}));
await import("../recoveryCapture");

function session(userId = "recovery-user", sessionId = "recovery-session", recoveryAge = 0): RecoveryAuthSession {
  const claims = { session_id: sessionId, amr: [{ method: "recovery", timestamp: Math.floor(Date.now() / 1000) - recoveryAge }] };
  return { user: { id: userId }, access_token: `synthetic.${btoa(JSON.stringify(claims))}.unsigned` };
}

function reload() {
  resetRecoveryForTests();
  resetRecoveryPersistenceForTests();
  initRecoveryFromLocation("http://localhost/");
}

describe("recovery continuity is bound to the SDK session", () => {
  beforeEach(() => {
    localStorage.clear();
    reload();
  });

  it("recovers a cleaned callback even if the event preceded subscription", () => {
    h.listener?.("INITIAL_SESSION", session());
    expect(getRecoveryStatus()).toBe("active");
    expect(getRecoveryUserId()).toBe("recovery-user");
  });

  it("keeps unfinished recovery gated after reload and beyond the AMR freshness window", () => {
    h.listener?.("PASSWORD_RECOVERY", session());
    reload();
    h.listener?.("INITIAL_SESSION", session("recovery-user", "recovery-session", 3600));
    expect(getRecoveryStatus()).toBe("active");
    const saved = JSON.parse(localStorage.getItem(RECOVERY_STORAGE_KEY)!);
    expect(saved).toEqual({ userId: "recovery-user", sessionId: "recovery-session", phase: "unfinished" });
    expect(JSON.stringify(saved)).not.toContain("access_token");
  });

  it("does not reenter recovery after successful update despite recovery AMR remaining", () => {
    h.listener?.("PASSWORD_RECOVERY", session());
    completeRecovery();
    reload();
    h.listener?.("INITIAL_SESSION", session());
    expect(getRecoveryStatus()).toBe("idle");
    h.listener?.("TOKEN_REFRESHED", session());
    expect(getRecoveryStatus()).toBe("idle");
  });

  it("does not treat another user or a later normal login as the unfinished session", () => {
    h.listener?.("PASSWORD_RECOVERY", session());
    for (const current of [session("administrator", "other-session", 3600), session("recovery-user", "new-login", 3600)]) {
      reload();
      h.listener?.("INITIAL_SESSION", current);
      expect(getRecoveryStatus()).toBe("idle");
      expect(getRecoveryUserId()).toBeNull();
    }
  });

  it("invalid recovery URL cannot reactivate even a remembered recovery session", () => {
    h.listener?.("PASSWORD_RECOVERY", session());
    reload();
    initRecoveryFromLocation("http://localhost/#error=access_denied&error_code=otp_expired");
    h.listener?.("INITIAL_SESSION", session());
    expect(getRecoveryStatus()).toBe("error");
    expect(getRecoveryUserId()).toBeNull();
  });

  it("invalidates the active form on a cross-tab identity change", () => {
    h.listener?.("PASSWORD_RECOVERY", session());
    h.listener?.("SIGNED_IN", session("administrator", "other-session", 3600));
    expect(getRecoveryStatus()).toBe("error");
    expect(getRecoveryUserId()).toBeNull();
  });

  it("a failed incoming token cannot reuse an older valid recovery session", () => {
    h.listener?.("PASSWORD_RECOVERY", session());
    reload();
    initRecoveryFromLocation(`http://localhost/#type=recovery&access_token=${session("other-user", "other-session")!.access_token}`);
    h.listener?.("INITIAL_SESSION", session());
    expect(getRecoveryStatus()).toBe("pending");
    expect(getRecoveryUserId()).toBeNull();
  });

  it("a delayed successful update cannot complete a newer recovery", () => {
    h.listener?.("PASSWORD_RECOVERY", session());
    const submitted = getRecoveryIdentityKey();
    h.listener?.("PASSWORD_RECOVERY", session("other-user", "other-session"));
    expect(completeRecovery(submitted)).toBe(false);
    expect(getRecoveryStatus()).toBe("active");
    expect(getRecoveryUserId()).toBe("other-user");
    expect(JSON.parse(localStorage.getItem(RECOVERY_STORAGE_KEY)!).phase).toBe("unfinished");
  });

  it("a code awaiting exchange cannot borrow a previous recovery session", () => {
    h.listener?.("PASSWORD_RECOVERY", session());
    reload();
    initRecoveryFromLocation("http://localhost/auth?code=synthetic-invalid-code&type=recovery");
    h.listener?.("INITIAL_SESSION", session());
    expect(getRecoveryStatus()).toBe("pending");
    expect(getRecoveryUserId()).toBeNull();
  });

  it("an incomplete query-only link cannot activate an unrelated old recovery", () => {
    initRecoveryFromLocation("http://localhost/auth?type=recovery");
    h.listener?.("INITIAL_SESSION", session());
    expect(getRecoveryStatus()).toBe("pending");
  });

  it("a different session for the same user invalidates a pending password update", () => {
    h.listener?.("PASSWORD_RECOVERY", session());
    const submitted = getRecoveryIdentityKey();
    h.listener?.("SIGNED_IN", session("recovery-user", "new-login", 3600));
    expect(getRecoveryStatus()).toBe("error");
    expect(completeRecovery(submitted)).toBe(false);
  });

  it("ignores corrupt continuity records and future AMR timestamps", () => {
    localStorage.setItem(RECOVERY_STORAGE_KEY, "not json");
    h.listener?.("INITIAL_SESSION", session("recovery-user", "recovery-session", -3600));
    expect(getRecoveryStatus()).toBe("idle");
  });
});
