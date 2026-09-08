import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "@/contexts/AuthContext";
import {
  resetRecoveryCaptureForTests,
  startRecoveryCapture,
} from "@/features/auth/recoveryCapture";
import {
  detectRecoveryFromHref,
  getRecoveryStatus,
  initRecoveryFromLocation,
  resetRecoveryForTests,
  RECOVERY_PENDING_TIMEOUT_MS,
} from "@/features/auth/recoverySession";
import { AuthGuard } from "@/layouts/AuthGuard";
import { useLocation } from "@/lib/router-compat";
import { TestRouter } from "@/test/router";
import AuthPage from "../pages/AuthPage";

/**
 * AUTH-REC-01 — composición REAL de producción: `/auth` es pública y queda
 * FUERA de `AuthGuard`; el resto del ERP va dentro del guard. SDK simulado,
 * sin red (la barrera de `src/test/setup.ts` bloquearía cualquier fetch real).
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
/** Sesión previa de OTRA persona que el SDK conserva si el enlace falla. */
const FOREIGN_SESSION = { user: { id: "u-9", email: "otro@liftgo.mx" }, access_token: "y" };

function emit(event: string, session: unknown) {
  h.session = session;
  act(() => {
    for (const cb of [...h.callbacks]) cb(event, session);
  });
}

/** Réplica de la composición de rutas de producción. */
function Composition() {
  const { pathname } = useLocation();
  if (pathname === "/auth") return <AuthPage />;
  return (
    <AuthGuard>
      <div>Contenido ERP</div>
    </AuthGuard>
  );
}

function renderApp(initial = "/auth") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TestRouter initialEntries={[initial]}>
        <AuthProvider>
          <Composition />
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
  // La captura temprana se registra al importar el módulo; se vuelve a
  // registrar aquí porque cada test limpia los callbacks del SDK simulado.
  resetRecoveryCaptureForTests();
  startRecoveryCapture();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AUTH-REC-01 — recuperación de contraseña", () => {
  it("arranque en frío: evento válido ANTES de montar React mantiene el formulario", async () => {
    initRecoveryFromLocation("http://localhost/auth#type=recovery");
    emit("PASSWORD_RECOVERY", SESSION);
    expect(getRecoveryStatus()).toBe("active");

    renderApp();
    expect(await screen.findByLabelText("Nueva contraseña", {}, { timeout: 5000 })).toBeTruthy();
  });

  it("evento con la página ya montada confirma la recuperación", async () => {
    initRecoveryFromLocation("http://localhost/auth#type=recovery");
    renderApp();
    expect(await screen.findByText("Validando tu enlace de recuperación…")).toBeTruthy();

    emit("PASSWORD_RECOVERY", SESSION);
    expect(await screen.findByLabelText("Nueva contraseña")).toBeTruthy();
    expect(getRecoveryStatus()).toBe("active");
  });

  it("enlace legacy a la raíz: el guard muestra el formulario, no el ERP", async () => {
    initRecoveryFromLocation("http://localhost/?type=recovery");
    emit("PASSWORD_RECOVERY", { user: { id: "c-1", email: "cliente@empresa.mx" } });

    renderApp("/");
    expect(await screen.findByLabelText("Nueva contraseña", {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByText("Contenido ERP")).toBeNull();
  });

  it("P1: una sesión ajena NUNCA confirma la recuperación ni cambia su contraseña", async () => {
    initRecoveryFromLocation("http://localhost/auth#type=recovery");
    h.session = FOREIGN_SESSION;
    renderApp();

    // El SDK entrega la sesión previa sin emitir PASSWORD_RECOVERY.
    emit("INITIAL_SESSION", FOREIGN_SESSION);
    emit("SIGNED_IN", FOREIGN_SESSION);

    expect(await screen.findByText("Validando tu enlace de recuperación…")).toBeTruthy();
    expect(getRecoveryStatus()).toBe("pending");
    expect(screen.queryByLabelText("Nueva contraseña")).toBeNull();
    expect(screen.queryByTestId("auth-submit")).toBeNull();
    expect(h.updateUser).not.toHaveBeenCalled();
    // Tampoco se cierra silenciosamente la sesión ajena.
    expect(h.signOut).not.toHaveBeenCalled();
  });

  it("pending que nunca concluye termina en error, no en espera infinita", async () => {
    vi.useFakeTimers();
    initRecoveryFromLocation("http://localhost/auth#type=recovery");
    expect(getRecoveryStatus()).toBe("pending");

    act(() => { vi.advanceTimersByTime(RECOVERY_PENDING_TIMEOUT_MS + 1); });
    expect(getRecoveryStatus()).toBe("error");
  });

  it("P2: enlace expirado estándar SIN type se reconoce como error", () => {
    expect(
      detectRecoveryFromHref(
        "http://localhost/auth#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
      ),
    ).toBe("error");
  });

  it("P3: tras cambiar la contraseña sale de /auth hacia la app", async () => {
    initRecoveryFromLocation("http://localhost/auth#type=recovery");
    emit("PASSWORD_RECOVERY", SESSION);
    renderApp();

    const input = await screen.findByLabelText("Nueva contraseña", {}, { timeout: 5000 });
    fireEvent.change(input, { target: { value: "nuevaClave123" } });
    fireEvent.click(screen.getByTestId("auth-submit"));

    await waitFor(() => expect(h.updateUser).toHaveBeenCalledWith({ password: "nuevaClave123" }));
    await waitFor(() => expect(getRecoveryStatus()).toBe("idle"));
    expect(await screen.findByText("Contenido ERP", {}, { timeout: 5000 })).toBeTruthy();
  });

  it("P3: el login ordinario en /auth también entra a la app", async () => {
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
    emit("SIGNED_IN", SESSION);
    expect(await screen.findByText("Contenido ERP", {}, { timeout: 5000 })).toBeTruthy();
    expect(getRecoveryStatus()).toBe("idle");
  });

  it("cancelar cierra la sesión de recuperación y vuelve al login", async () => {
    initRecoveryFromLocation("http://localhost/auth#type=recovery");
    emit("PASSWORD_RECOVERY", SESSION);
    renderApp();
    await screen.findByLabelText("Nueva contraseña", {}, { timeout: 5000 });

    fireEvent.click(screen.getByText("Cancelar y volver a Iniciar Sesión"));
    await waitFor(() => expect(h.signOut).toHaveBeenCalled());
    await waitFor(() => expect(getRecoveryStatus()).toBe("idle"));
    expect(await screen.findByLabelText("Contraseña")).toBeTruthy();
    expect(h.updateUser).not.toHaveBeenCalled();
  });

  it("P4: «Solicitar un enlace nuevo» lleva al formulario de correo, no al login", async () => {
    initRecoveryFromLocation(
      "http://localhost/auth#error=access_denied&error_code=otp_expired",
    );
    h.session = FOREIGN_SESSION;
    renderApp();

    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByText("Solicitar un enlace nuevo"));

    expect(await screen.findByText("Restablecer Contraseña")).toBeTruthy();
    expect(screen.queryByLabelText("Contraseña")).toBeNull();
    expect(screen.getByLabelText("Correo Electrónico")).toBeTruthy();
    // Nunca se toca la sesión ajena por un enlace inválido.
    expect(h.updateUser).not.toHaveBeenCalled();
    expect(h.signOut).not.toHaveBeenCalled();
  });
});
