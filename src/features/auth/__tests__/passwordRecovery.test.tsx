import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/contexts/AuthContext";
import {
  initRecoveryFromLocation,
  resetRecoveryForTests,
  getRecoveryStatus,
} from "@/features/auth/recoverySession";
import { AuthGuard } from "@/layouts/AuthGuard";
import { TestRouter } from "@/test/router";
import type { ReactNode } from "react";

/**
 * AUTH-REC-01 — composición REAL de provider + guard + página + formulario
 * (sin mockear AuthGuard) sobre un SDK simulado. Sin red: la barrera de
 * `src/test/setup.ts` seguiría bloqueando cualquier fetch real.
 */
const h = vi.hoisted(() => {
  const callbacks: Array<(event: string, session: unknown) => void> = [];
  let session: unknown = null;
  return {
    callbacks,
    get session() { return session; },
    set session(v: unknown) { session = v; },
    signInWithPassword: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    updateUser: vi.fn(async () => ({ error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ error: null })),
  };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (cb: (e: string, s: unknown) => void) => {
        h.callbacks.push(cb);
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
      getSession: async () => ({ data: { session: h.session } }),
      signInWithPassword: h.signInWithPassword,
      signOut: h.signOut,
      updateUser: h.updateUser,
      resetPasswordForEmail: h.resetPasswordForEmail,
    },
  },
}));

vi.mock("@/features/users", () => ({
  useUserRole: () => ({ data: "admin", isLoading: false }),
}));
vi.mock("@/features/company-settings", () => ({
  usePublicBranding: () => ({ data: null }),
}));
vi.mock("@/features/changelog", () => ({
  useCurrentVersion: () => "0.0.0-test",
}));

const SESSION = { user: { id: "u-1", email: "empleado@liftgo.mx" }, access_token: "x" };

function emit(event: string, session: unknown) {
  h.session = session;
  act(() => {
    for (const cb of [...h.callbacks]) cb(event, session);
  });
}

function renderApp(children: ReactNode = <div>Contenido ERP</div>) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TestRouter initialEntries={["/auth"]}>
        <AuthProvider>
          <AuthGuard>{children}</AuthGuard>
        </AuthProvider>
      </TestRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetRecoveryForTests();
  h.callbacks.length = 0;
  h.session = null;
  vi.clearAllMocks();
});

describe("AUTH-REC-01 — recuperación de contraseña", () => {
  it("arranque en frío: el enlace consumido por el SDK mantiene el formulario", async () => {
    // El SDK ya limpió el fragmento; el store lo detectó antes.
    initRecoveryFromLocation("http://localhost/auth#access_token=t&type=recovery");
    renderApp();
    emit("SIGNED_IN", SESSION);

    expect(await screen.findByLabelText("Nueva contraseña")).toBeTruthy();
    expect(screen.queryByText("Contenido ERP")).toBeNull();
    expect(getRecoveryStatus()).toBe("active");
  });

  it("evento con la página ya montada: cambia del ERP al formulario", async () => {
    h.session = SESSION;
    renderApp();
    await screen.findByText("Contenido ERP");

    emit("PASSWORD_RECOVERY", SESSION);
    expect(await screen.findByLabelText("Nueva contraseña")).toBeTruthy();
    expect(screen.queryByText("Contenido ERP")).toBeNull();
  });

  it("cliente del portal: el enlace legacy a la raíz también abre el formulario", async () => {
    initRecoveryFromLocation("http://localhost/?type=recovery");
    renderApp();
    emit("SIGNED_IN", { user: { id: "c-1", email: "cliente@empresa.mx" } });

    expect(await screen.findByLabelText("Nueva contraseña")).toBeTruthy();
  });

  it("confirma la nueva contraseña y devuelve al usuario a la app", async () => {
    initRecoveryFromLocation("http://localhost/auth#type=recovery");
    renderApp();
    emit("SIGNED_IN", SESSION);

    const input = await screen.findByLabelText("Nueva contraseña");
    fireEvent.change(input, { target: { value: "nuevaClave123" } });
    fireEvent.click(screen.getByTestId("auth-submit"));

    await waitFor(() => expect(h.updateUser).toHaveBeenCalledWith({ password: "nuevaClave123" }));
    await waitFor(() => expect(getRecoveryStatus()).toBe("idle"));
    expect(await screen.findByText("Contenido ERP")).toBeTruthy();
  });

  it("cancelar cierra la sesión de recuperación y vuelve al login", async () => {
    initRecoveryFromLocation("http://localhost/auth#type=recovery");
    renderApp();
    emit("SIGNED_IN", SESSION);
    await screen.findByLabelText("Nueva contraseña");

    fireEvent.click(screen.getByText("Cancelar y volver a Iniciar Sesión"));
    await waitFor(() => expect(h.signOut).toHaveBeenCalled());
    expect(getRecoveryStatus()).toBe("idle");
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it("enlace inválido/expirado: muestra el error y nunca cambia otra sesión abierta", async () => {
    initRecoveryFromLocation(
      "http://localhost/auth#error=access_denied&error_code=otp_expired&type=recovery",
    );
    h.session = SESSION;
    renderApp();
    emit("SIGNED_IN", SESSION);

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByLabelText("Nueva contraseña")).toBeNull();
    expect(screen.queryByTestId("auth-submit")).toBeNull();
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it("login ordinario sigue funcionando sin flujo de recuperación", async () => {
    renderApp();
    emit("INITIAL_SESSION", null);

    const email = await screen.findByLabelText("Correo Electrónico");
    fireEvent.change(email, { target: { value: "empleado@liftgo.mx" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "secreta123" } });
    fireEvent.click(screen.getByTestId("auth-submit"));

    await waitFor(() =>
      expect(h.signInWithPassword).toHaveBeenCalledWith({
        email: "empleado@liftgo.mx",
        password: "secreta123",
      }),
    );
    expect(getRecoveryStatus()).toBe("idle");
  });
});
