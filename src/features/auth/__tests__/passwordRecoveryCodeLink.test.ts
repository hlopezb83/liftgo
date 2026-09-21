import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AUTH-REC-02 — enlaces de recuperación entregados como `?code=…`.
 *
 * Sin canje explícito no hay sesión ni evento `PASSWORD_RECOVERY`, y el
 * usuario aterrizaba en la pantalla de inicio de sesión en vez del formulario
 * de nueva contraseña. Estas pruebas no tocan red (la barrera de
 * `src/test/setup.ts` bloquearía cualquier fetch real).
 */
const h = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(async (_code: string) => ({
    data: { session: { user: { id: "user-a" } } },
    error: null,
  })),
  onAuthStateChange: vi.fn(() => ({
    data: { subscription: { unsubscribe: () => undefined } },
  })),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: h.onAuthStateChange,
      exchangeCodeForSession: h.exchangeCodeForSession,
    },
  },
}));

const {
  detectRecoveryCodeFromHref,
  getRecoveryStatus,
  getRecoveryUserId,
  initRecoveryFromLocation,
  resetRecoveryForTests,
} = await import("../recoverySession");
const { exchangeRecoveryCodeFromUrl } = await import("../recoveryCapture");

function setHref(href: string) {
  window.history.replaceState({}, "", href);
}

describe("detectRecoveryCodeFromHref", () => {
  it("reconoce el código del enlace de correo", () => {
    expect(detectRecoveryCodeFromHref("http://localhost/auth?code=abc123")).toBe("abc123");
    expect(detectRecoveryCodeFromHref("http://localhost/?code=abc123&type=recovery")).toBe("abc123");
  });

  it("ignora URLs sin código, con error o de otro tipo", () => {
    expect(detectRecoveryCodeFromHref("http://localhost/auth")).toBeNull();
    expect(detectRecoveryCodeFromHref("http://localhost/auth?code=a&error=access_denied")).toBeNull();
    expect(detectRecoveryCodeFromHref("http://localhost/auth?code=a&type=invite")).toBeNull();
  });
});

describe("recuperación por enlace con código", () => {
  beforeEach(() => {
    resetRecoveryForTests();
    h.exchangeCodeForSession.mockClear();
  });

  afterEach(() => {
    resetRecoveryForTests();
    setHref("/");
  });

  it("marca el flujo como pendiente al aterrizar con ?code=", () => {
    initRecoveryFromLocation("http://localhost/auth?code=abc123");
    expect(getRecoveryStatus()).toBe("pending");
  });

  it("canjea el código, activa el formulario y limpia la URL", async () => {
    setHref("/auth?code=abc123");
    initRecoveryFromLocation(window.location.href);
    exchangeRecoveryCodeFromUrl();
    await vi.waitFor(() => expect(getRecoveryStatus()).toBe("active"));
    expect(h.exchangeCodeForSession).toHaveBeenCalledWith("abc123");
    expect(getRecoveryUserId()).toBe("user-a");
    expect(window.location.search).toBe("");
  });

  it("un código inválido termina en error, nunca en formulario utilizable", async () => {
    h.exchangeCodeForSession.mockResolvedValueOnce({
      data: { session: null },
      error: { message: "invalid" },
    } as never);
    setHref("/auth?code=roto");
    initRecoveryFromLocation(window.location.href);
    exchangeRecoveryCodeFromUrl();
    await vi.waitFor(() => expect(getRecoveryStatus()).toBe("error"));
    expect(getRecoveryUserId()).toBeNull();
  });

  it("sin código no se llama al SDK", () => {
    setHref("/auth");
    exchangeRecoveryCodeFromUrl();
    expect(h.exchangeCodeForSession).not.toHaveBeenCalled();
  });
});
