import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import type { ReactNode } from "react";
import UserManagementPage from "../UserManagementPage";

const state = vi.hoisted(() => ({ empty: false }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "admin-1" } }) }));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => vi.fn() }));
vi.mock("@/components/layout/PageTransition", () => ({ PageTransition: ({ children }: { children: ReactNode }) => children }));
vi.mock("../../hooks/useHasModuleAccess", () => ({ useHasModuleAccess: () => false }));
vi.mock("../../hooks/useUserManagement", () => ({
  useUsersWithRoles: () => ({
    data: state.empty ? [] : [{ user_id: "user-1", full_name: "Ventas de prueba", email: "qa@example.test", role: "ventas", is_active: true, created_at: "2026-01-01T12:00:00Z" }],
    isLoading: false, isError: false, refetch: vi.fn(),
  }),
  useToggleStatus: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("../../components/users/CredentialsDialog", () => ({ CredentialsDialog: () => null }));
vi.mock("../../components/users/DeleteUserDialog", () => ({ DeleteUserDialog: () => null }));
vi.mock("../../components/users/EditNameDialog", () => ({ EditNameDialog: () => null }));
vi.mock("../../components/users/InviteUserDialog", () => ({ InviteUserDialog: () => null }));
vi.mock("../../components/users/RoleChangeDialog", () => ({ RoleChangeDialog: () => null }));
vi.mock("../../components/users/SetPasswordDialog", () => ({ SetPasswordDialog: () => null }));

beforeEach(() => { state.empty = false; });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("UserManagementPage: vacío filtrado", () => {
  it("limpia búsqueda y rol juntos y recupera usuarios existentes", async () => {
    render(<UserManagementPage />, { wrapper: createQueryWrapper().Wrapper });
    fireEvent.keyDown(screen.getByText("Todos los roles").closest("button")!, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Mecánico" }));
    vi.useFakeTimers();
    fireEvent.change(screen.getByPlaceholderText("Buscar por nombre o correo…"), { target: { value: "No coincide" } });
    expect(screen.getByText("No hay resultados con los filtros actuales")).toBeInTheDocument();
    expect(screen.queryByText("No hay usuarios")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));

    expect(screen.getByPlaceholderText("Buscar por nombre o correo…")).toHaveValue("");
    expect(screen.getByText("Todos los roles")).toBeInTheDocument();
    expect(screen.getByText("Ventas de prueba")).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(screen.getByPlaceholderText("Buscar por nombre o correo…")).toHaveValue("");
    expect(screen.getByText("Ventas de prueba")).toBeInTheDocument();
  });

  it("conserva el vacío real cuando no hay filtros ni usuarios", () => {
    state.empty = true;
    render(<UserManagementPage />, { wrapper: createQueryWrapper().Wrapper });
    expect(screen.getByText("No hay usuarios")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Limpiar filtros" })).not.toBeInTheDocument();
  });
});
