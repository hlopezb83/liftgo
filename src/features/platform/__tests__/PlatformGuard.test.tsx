import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAuthSnapshot } from "@/lib/ui/authSnapshot";

const state = vi.hoisted(() => ({
  user: { id: "operator", email: "operator@example.com" } as { id: string; email: string } | null,
  isLoading: false,
  signOut: vi.fn(),
  operator: { data: true as boolean | undefined, isPending: false, isError: false, refetch: vi.fn() },
  recovery: "idle",
  pathname: "/platform/organizations",
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => state }));
vi.mock("@/features/auth", () => ({ useRecoveryStatus: () => state.recovery }));
vi.mock("../hooks/usePlatformOperator", () => ({ usePlatformOperatorStatus: () => state.operator }));
vi.mock("@/lib/observability/sentry", () => ({ Sentry: { setUser: vi.fn(), setTag: vi.fn() } }));
vi.mock("@/lib/router-compat", () => ({ useLocation: () => ({ pathname: state.pathname }) }));
vi.mock("@/lib/router-compat-ui", () => ({
  Navigate: ({ to }: { to: string }) => <p>Destino: {to}</p>,
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));
import { PlatformGuard } from "../components/PlatformGuard";

function tree() { return <PlatformGuard><p>Datos globales protegidos</p></PlatformGuard>; }

describe("PlatformGuard", () => {
  beforeEach(() => {
    state.user = { id: "operator", email: "operator@example.com" };
    state.isLoading = false;
    state.operator = { data: true, isPending: false, isError: false, refetch: vi.fn() };
    state.recovery = "idle";
    state.signOut.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  it("acepta asignación explícita sin proveedor empresarial y retira datos al revocar", () => {
    const view = render(tree());
    expect(screen.getByText("Datos globales protegidos")).toBeInTheDocument();
    expect(getAuthSnapshot().role).toBe("platform_operator");
    state.operator.data = false;
    view.rerender(tree());
    expect(screen.queryByText("Datos globales protegidos")).not.toBeInTheDocument();
    expect(screen.getByText("Acceso restringido")).toBeInTheDocument();
    expect(getAuthSnapshot().role).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    expect(state.signOut).toHaveBeenCalledOnce();
  });

  it("envía al login con el destino interno cuando no hay sesión", () => {
    state.user = null;
    render(tree());
    expect(screen.getByText("Destino: /platform/login?next=%2Fplatform%2Forganizations")).toBeInTheDocument();
    expect(screen.queryByText("Datos globales protegidos")).not.toBeInTheDocument();
  });

  it("un error de verificación bloquea incluso un true en caché y permite reintentar", () => {
    state.operator.isError = true;
    render(tree());
    expect(screen.queryByText("Datos globales protegidos")).not.toBeInTheDocument();
    expect(getAuthSnapshot().role).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(state.operator.refetch).toHaveBeenCalledOnce();
  });

  it("la recuperación de contraseña conserva su formulario público", () => {
    state.recovery = "active";
    render(tree());
    expect(screen.getByText("Destino: /auth")).toBeInTheDocument();
    expect(screen.queryByText("Datos globales protegidos")).not.toBeInTheDocument();
  });

  it("no deja una pantalla de carga infinita sin conexión", () => {
    vi.useFakeTimers();
    state.operator = { data: undefined, isPending: true, isError: false, refetch: vi.fn() };
    render(tree());
    expect(screen.getByText("Verificando acceso…")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(8_000));
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.queryByText("Datos globales protegidos")).not.toBeInTheDocument();
  });
});
