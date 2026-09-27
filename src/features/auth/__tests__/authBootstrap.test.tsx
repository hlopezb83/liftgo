import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

const sdk = vi.hoisted(() => ({
  callback: null as ((event: AuthChangeEvent, session: Session | null) => void) | null,
  getSession: vi.fn(), unsubscribe: vi.fn(),
}));
vi.mock("@/features/auth/recoveryCapture", () => ({}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {
  getSession: sdk.getSession,
  onAuthStateChange: (callback: typeof sdk.callback) => {
    sdk.callback = callback;
    return { data: { subscription: { unsubscribe: sdk.unsubscribe } } };
  },
} } }));

function Status() {
  const { user, session, isLoading } = useAuth();
  return <div>{isLoading ? "Cargando" : `${user?.id ?? "Sin sesión"}:${session?.access_token ?? "sin token"}`}</div>;
}

function session(id: string, token = id): Session {
  return { user: { id }, access_token: token } as Session;
}

beforeEach(() => { vi.clearAllMocks(); sdk.callback = null; });

describe("auth bootstrap ordering", () => {
  it.each(["SIGNED_IN", "TOKEN_REFRESHED", "PASSWORD_RECOVERY"] as const)(
    "una respuesta inicial vacía no pisa %s", async (event) => {
      let resolve: (value: { data: { session: Session | null } }) => void = () => undefined;
      sdk.getSession.mockReturnValue(new Promise((done) => { resolve = done; }));
      render(<AuthProvider><Status /></AuthProvider>);
      act(() => sdk.callback?.(event, session("current", "new-token")));
      await act(async () => resolve({ data: { session: null } }));
      expect(screen.getByText("current:new-token")).toBeVisible();
    },
  );

  it("una respuesta inicial vieja no resucita al usuario después de salir", async () => {
    let resolve: (value: { data: { session: Session | null } }) => void = () => undefined;
    sdk.getSession.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<AuthProvider><Status /></AuthProvider>);
    act(() => sdk.callback?.("SIGNED_OUT", null));
    await act(async () => resolve({ data: { session: session("old") } }));
    expect(screen.getByText("Sin sesión:sin token")).toBeVisible();
  });

  it("una cuenta anterior no reemplaza la identidad nueva", async () => {
    let resolve: (value: { data: { session: Session | null } }) => void = () => undefined;
    sdk.getSession.mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<AuthProvider><Status /></AuthProvider>);
    act(() => sdk.callback?.("SIGNED_IN", session("new")));
    await act(async () => resolve({ data: { session: session("old") } }));
    expect(screen.getByText("new:new")).toBeVisible();
  });

  it("sin eventos del SDK, el fallback completa el arranque", async () => {
    sdk.getSession.mockResolvedValue({ data: { session: session("fallback") } });
    render(<AuthProvider><Status /></AuthProvider>);
    await waitFor(() => expect(screen.getByText("fallback:fallback")).toBeVisible());
  });

  it("un fallo inicial termina la carga sin crear una sesión", async () => {
    sdk.getSession.mockRejectedValue(new Error("offline"));
    render(<AuthProvider><Status /></AuthProvider>);
    await waitFor(() => expect(screen.getByText("Sin sesión:sin token")).toBeVisible());
  });

  it("al desmontar cancela la suscripción aunque el fallback siga pendiente", () => {
    sdk.getSession.mockReturnValue(new Promise(() => undefined));
    const view = render(<AuthProvider><Status /></AuthProvider>);
    view.unmount();
    expect(sdk.unsubscribe).toHaveBeenCalledOnce();
    act(() => sdk.callback?.("SIGNED_IN", session("late")));
    expect(screen.queryByText("late:late")).not.toBeInTheDocument();
  });
});
