import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ role: "dispatcher", access: "none" }));

vi.mock("@/features/users", () => ({
  getAccessLevel: () => state.access,
  useUserRole: () => ({ data: state.role, isLoading: false, isError: false }),
  useRolePermissions: () => ({ data: {}, isLoading: false, isError: false }),
}));

vi.mock("@/layouts/NoAccess", () => ({
  NoAccess: () => <div data-testid="no-access">No Access</div>,
}));

import { RoleGuard } from "@/layouts/RoleGuard";

beforeEach(() => {
  state.role = "dispatcher";
  state.access = "none";
});

describe("RoleGuard (R6-B1)", () => {
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
