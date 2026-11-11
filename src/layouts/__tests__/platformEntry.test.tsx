import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({
  path: "/", search: "", role: "admin", roleLoading: false,
  roleError: false, refetchRole: vi.fn(), memberType: "internal" as "internal" | "portal",
  operator: { data: true as boolean | undefined, isPending: false, isError: false, refetch: vi.fn() },
  organizationMounted: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "user" }, isLoading: false }) }));
vi.mock("@/features/users", () => ({
  useUserRole: () => ({ data: state.roleError ? undefined : state.role, isLoading: state.roleLoading, isError: state.roleError, refetch: state.refetchRole }),
  AuthSnapshotSync: () => null,
}));
vi.mock("@/contexts/OrganizationContext", () => ({
  OrganizationGate: ({ children }: { children: ReactNode }) => <section data-testid="organization-gate">{children}</section>,
  OrganizationProvider: ({ children }: { children: ReactNode }) => { state.organizationMounted(); return children; },
  useOrganizationContext: () => ({ status: "ready", memberType: state.memberType }),
}));
vi.mock("@/features/auth/hooks/useRecoveryStatus", () => ({ useRecoveryStatus: () => "idle" }));
vi.mock("@/features/platform", async () => {
  const navigation = await import("@/features/platform/lib/platformNavigation");
  return { ...navigation, usePlatformOperatorStatus: () => state.operator,
    PlatformSessionProvider: ({ children }: { children: ReactNode }) => <section data-testid="platform-cache">{children}</section> };
});
vi.mock("@/lib/query/IdentityScopedPersistence", () => ({ IdentityScopedPersistence: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/lib/router-compat", () => ({ useLocation: () => ({ pathname: state.path, search: state.search }) }));
vi.mock("@/lib/router-compat-ui", () => ({ Navigate: ({ to }: { to: string }) => <p>Destino: {to}</p> }));
import { AuthGuard } from "../AuthGuard";
import { WorkspaceProviders } from "../WorkspaceProviders";

describe("árboles de empresa y plataforma", () => {
  beforeEach(() => {
    state.path = "/"; state.search = ""; state.role = "admin"; state.roleLoading = false;
    state.roleError = false; state.memberType = "internal"; state.refetchRole.mockClear();
    state.operator = { data: true, isPending: false, isError: false, refetch: vi.fn() };
    state.organizationMounted.mockClear();
  });
  it("el operador entra desde raíz aunque no tenga un rol empresarial resuelto", () => {
    state.roleLoading = true;
    render(<AuthGuard><p>ERP</p></AuthGuard>);
    expect(screen.getByText("Destino: /platform")).toBeInTheDocument();
    expect(screen.queryByTestId("organization-gate")).not.toBeInTheDocument();
  });
  it("el ERP explícito conserva la validación de empresa incluso para operadores", () => {
    state.search = "?workspace=organization";
    render(<AuthGuard><p>ERP</p></AuthGuard>);
    expect(screen.getByTestId("organization-gate")).toBeInTheDocument();
  });
  it("un admin no operador conserva el ERP y un cliente conserva su portal", () => {
    state.operator.data = false;
    const view = render(<AuthGuard><p>ERP</p></AuthGuard>);
    expect(screen.getByTestId("organization-gate")).toBeInTheDocument();
    state.memberType = "portal";
    view.rerender(<AuthGuard><p>ERP</p></AuthGuard>);
    expect(screen.getByText("Destino: /portal")).toBeInTheDocument();
  });
  it("preserva el portal de un miembro verificado aunque falle la consulta de rol", () => {
    state.path = "/portal/invoices";
    state.roleError = true;
    state.memberType = "portal";
    const view = render(<AuthGuard><p>Portal</p></AuthGuard>);
    expect(screen.getByText("Portal")).toBeInTheDocument();
    expect(screen.queryByText("Destino: /")).not.toBeInTheDocument();
    state.path = "/maintenance";
    view.rerender(<AuthGuard><p>ERP</p></AuthGuard>);
    expect(screen.getByText("Destino: /portal")).toBeInTheDocument();
    expect(screen.queryByText("ERP")).not.toBeInTheDocument();
  });
  it("permite reintentar un error de rol empresarial sin montar el ERP", () => {
    state.path = "/maintenance";
    state.roleError = true;
    render(<AuthGuard><p>ERP</p></AuthGuard>);
    expect(screen.queryByText("ERP")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(state.refetchRole).toHaveBeenCalledOnce();
  });
  it.each(["/platform", "/platform/login", "/platform/catalogs"])("%s no monta contexto empresarial", (path) => {
    state.path = path;
    render(<WorkspaceProviders><p>Contenido</p></WorkspaceProviders>);
    expect(screen.getByTestId("platform-cache")).toBeInTheDocument();
    expect(state.organizationMounted).not.toHaveBeenCalled();
  });
  it.each(["/bookings", "/portal", "/platformish"])("%s conserva proveedores empresariales", (path) => {
    state.path = path;
    render(<WorkspaceProviders><p>Contenido</p></WorkspaceProviders>);
    expect(state.organizationMounted).toHaveBeenCalled();
    expect(screen.queryByTestId("platform-cache")).not.toBeInTheDocument();
  });
});
