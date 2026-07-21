import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/users", () => ({
  getAccessLevel: () => "none",
  useUserRole: () => ({ data: "dispatcher", isLoading: false, isError: false }),
  useRolePermissions: () => ({ data: {}, isLoading: false, isError: false }),
}));

vi.mock("@/layouts/NoAccess", () => ({
  NoAccess: () => <div data-testid="no-access">No Access</div>,
}));

import { RoleGuard } from "@/layouts/RoleGuard";

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
});
