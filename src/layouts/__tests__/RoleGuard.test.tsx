import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ role: "dispatcher", access: "none", hasPermissions: true }));

vi.mock("@/features/users", () => ({
  getAccessLevel: (perms: unknown) => perms ? state.access : "none",
  hasFinancialAccess: (role: string) => role !== "dispatcher",
  useUserRole: () => ({ data: state.role, isLoading: false, isError: false }),
  useRolePermissions: () => ({ data: state.hasPermissions ? {} : undefined, isLoading: false, isError: false }),
}));

vi.mock("@/layouts/NoAccess", () => ({
  NoAccess: () => <div data-testid="no-access">No Access</div>,
}));

import { RoleGuard } from "@/layouts/RoleGuard";

beforeEach(() => {
  state.role = "dispatcher";
  state.access = "none";
  state.hasPermissions = true;
});

describe("RoleGuard (R6-B1)", () => {
  it("no abre un módulo sin permisos efectivos", () => {
    state.hasPermissions = false;
    state.access = "full";
    render(<RoleGuard module="Mantenimiento"><p>Contenido protegido</p></RoleGuard>);
    expect(screen.queryByText("Contenido protegido")).not.toBeInTheDocument();
    expect(screen.getByTestId("no-access")).toBeInTheDocument();
  });
  it("fallback={null} → no renderiza NoAccess ni children", () => {
    const { container } = render(
      <RoleGuard module="invoices" minAccess="full" fallback={null}>
        <button>Editar</button>
      </RoleGuard>,
    );
    expect(container.querySelector("[data-testid='no-access']")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });

  it("sin fallback → renderiza NoAccess por defecto", () => {
    render(
      <RoleGuard module="invoices" minAccess="full">
        <button>Editar</button>
      </RoleGuard>,
    );
    expect(screen.getByTestId("no-access")).toBeInTheDocument();
  });

  it("acceso suficiente → renderiza children", () => {
    render(
      <RoleGuard>
        <span data-testid="child">ok</span>
      </RoleGuard>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("oculta una acción aunque el módulo sea full cuando el servidor restringe el rol", () => {
    state.role = "ventas";
    state.access = "full";
    const { container } = render(
      <RoleGuard module="Clientes" minAccess="full" allowedRoles={["admin", "administrativo"]} fallback={null}>
        <button>Validar SAT</button>
      </RoleGuard>,
    );
    expect(container.querySelector("button")).toBeNull();
  });

  it("permite la misma acción a Administrativo con acceso full", () => {
    state.role = "administrativo";
    state.access = "full";
    render(
      <RoleGuard module="Clientes" minAccess="full" allowedRoles={["admin", "administrativo"]}>
        <button>Validar SAT</button>
      </RoleGuard>,
    );
    expect(screen.getByRole("button", { name: "Validar SAT" })).toBeInTheDocument();
  });
});


describe("RoleGuard financial-only route", () => {
  it("denies dispatcher even with Reportes full and never mounts children", () => {
    state.access = "full";
    const mount = vi.fn();
    function FinancialPage() { mount(); return <div>Financial data</div>; }
    render(<RoleGuard financial module="Reportes"><FinancialPage /></RoleGuard>);
    expect(mount).not.toHaveBeenCalled();
    expect(screen.getByTestId("no-access")).toBeInTheDocument();
  });
  it("preserves authorized report access for administrativo", () => {
    state.role = "administrativo";
    state.access = "read";
    render(<RoleGuard financial module="Reportes"><div>Financial data</div></RoleGuard>);
    expect(screen.getByText("Financial data")).toBeInTheDocument();
  });
});
