import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: null as { id: string } | null, isLoading: false, recovery: "idle", search: "?next=%2Fplatform%2Fcatalogs" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => state }));
vi.mock("@/features/auth", () => ({
  useRecoveryStatus: () => state.recovery,
  AuthPage: ({ platform, destination }: { platform: boolean; destination: string }) => <p>Formulario: {platform ? "plataforma" : "ERP"} {destination}</p>,
}));
vi.mock("@/lib/router-compat", () => ({ useLocation: () => ({ search: state.search }) }));
vi.mock("@/lib/router-compat-ui", () => ({ Navigate: ({ to }: { to: string }) => <p>Destino: {to}</p> }));
import PlatformLoginPage from "../pages/PlatformLoginPage";

describe("login de plataforma", () => {
  beforeEach(() => { state.user = null; state.isLoading = false; state.recovery = "idle"; state.search = "?next=%2Fplatform%2Fcatalogs"; });
  afterEach(() => vi.useRealTimers());
  it("abre el formulario propio con retorno interno", () => {
    render(<PlatformLoginPage />);
    expect(screen.getByText("Formulario: plataforma /platform/catalogs")).toBeInTheDocument();
  });
  it("una sesión existente va al guard del Centro y descarta un retorno externo", () => {
    state.user = { id: "operator" }; state.search = "?next=https://example.com";
    render(<PlatformLoginPage />);
    expect(screen.getByText("Destino: /platform")).toBeInTheDocument();
  });
  it("recuperación conserva el formulario incluso durante bootstrap de auth", () => {
    state.user = { id: "operator" }; state.isLoading = true; state.recovery = "active";
    render(<PlatformLoginPage />);
    expect(screen.getByText("Formulario: plataforma /platform/catalogs")).toBeInTheDocument();
  });
  it("ofrece reintento si el bootstrap no resuelve", () => {
    vi.useFakeTimers(); state.isLoading = true;
    render(<PlatformLoginPage />);
    act(() => vi.advanceTimersByTime(8_000));
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});
