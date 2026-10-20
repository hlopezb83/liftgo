import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ listener: null as null | ((e: string, s: unknown) => void) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { onAuthStateChange: vi.fn((cb) => { h.listener = cb; return { data: { subscription: { unsubscribe: () => undefined } } }; }) } },
}));

const { getRecoveryStatus, initRecoveryFromLocation, resetRecoveryForTests } = await import("../recoverySession");
const { isFreshRecoveryToken } = await import("../recoveryCapture");

function token(amr: unknown) {
  const b = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "");
  return `${b({ alg: "HS256" })}.${b({ amr, session_id: "synthetic-session" })}.firma`;
}
const now = Math.floor(Date.now() / 1000);

describe("AUTH-REC-03: PASSWORD_RECOVERY perdido", () => {
  beforeEach(() => {
    localStorage.clear();
    resetRecoveryForTests();
  });

  it("confirma con la sesión inicial si el token es de recuperación reciente", () => {
    initRecoveryFromLocation(`http://localhost/auth?type=recovery#access_token=${token([{ method: "recovery", timestamp: now }])}&type=recovery`);
    expect(getRecoveryStatus()).toBe("pending");
    h.listener?.("INITIAL_SESSION", { access_token: token([{ method: "recovery", timestamp: now }]), user: { id: "u1" } });
    expect(getRecoveryStatus()).toBe("active");
  });

  it("una sesión previa de contraseña no confirma la recuperación", () => {
    initRecoveryFromLocation(`http://localhost/auth?type=recovery#access_token=${token([{ method: "recovery", timestamp: now }])}&type=recovery`);
    h.listener?.("INITIAL_SESSION", { access_token: token([{ method: "password", timestamp: now }]), user: { id: "u1" } });
    expect(getRecoveryStatus()).toBe("pending");
  });

  it("rechaza recuperaciones viejas o tokens corruptos", () => {
    expect(isFreshRecoveryToken(token([{ method: "recovery", timestamp: now - 3600 }]))).toBe(false);
    expect(isFreshRecoveryToken("basura")).toBe(false);
  });
});
