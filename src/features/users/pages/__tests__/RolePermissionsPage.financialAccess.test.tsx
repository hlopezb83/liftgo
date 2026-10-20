import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
const mutate = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => vi.fn() }));
vi.mock("@/components/layout/PageTransition", () => ({ PageTransition: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../../hooks/useUserRole", () => ({ useUserRole: () => ({ data: "admin" }) }));
vi.mock("../../hooks/useRolePermissions", async (original) => ({
  ...await original<typeof import("../../hooks/useRolePermissions")>(),
  useRolePermissions: () => ({ data: { dispatcher: { Facturas: "full", Reservas: "full" }, administrativo: { Facturas: "full" } } }),
  useUpdatePermission: () => ({ mutate }),
}));
import RolePermissionsPage from "../RolePermissionsPage";

describe("RolePermissionsPage fixed dispatcher financial boundary", () => {
  it("shows effective denial and cannot offer an ineffective financial grant", () => {
    render(<RolePermissionsPage />);
    const financial = screen.getByRole("button", { name: "Despachador, Facturas: Sin acceso" });
    expect(financial).toBeDisabled();
    expect(financial).toHaveAttribute("title", "Rol operativo, sin acceso financiero");
    fireEvent.click(financial);
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Despachador, Reservas: Acceso completo; cambiar permiso" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Administrativo, Facturas: Acceso completo; cambiar permiso" })).toBeEnabled();
  });
});
