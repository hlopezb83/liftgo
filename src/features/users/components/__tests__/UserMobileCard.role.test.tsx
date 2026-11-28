import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRow } from "../../hooks/useUserManagement";
import type { AppRole } from "../../hooks/useUserRole";
import { RoleChangeDialog } from "../RoleChangeDialog";
import { UserMobileCard } from "../UserMobileCard";

const updateRole = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
vi.mock("../../hooks/useUserManagement", () => ({ useUpdateRole: () => updateRole }));

const user: UserRow = {
  user_id: "user-1", full_name: "Persona de prueba", email: "qa@example.test",
  created_at: "2026-01-01T12:00:00Z", role: "ventas", is_active: true,
};

function Harness({ u = user }: { u?: UserRow }) {
  const [target, setTarget] = useState<{ user: UserRow; newRole: AppRole } | null>(null);
  return <>
    <UserMobileCard canManage u={u} actions={{
      isToggling: false,
      onRoleChange: (selected, newRole) => setTarget({ user: selected, newRole }),
      onToggleStatus: vi.fn(), onEdit: vi.fn(), onSetPassword: vi.fn(), onDelete: vi.fn(),
    }} />
    <RoleChangeDialog target={target} onClose={() => setTarget(null)} />
  </>;
}

async function proposeRole() {
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
  fireEvent.click(await screen.findByRole("option", { name: "Mecánico" }));
  await screen.findByRole("alertdialog");
}

beforeEach(() => updateRole.mutateAsync.mockReset());
afterEach(cleanup);

describe("UserMobileCard: rol confirmado", () => {
  it("read access shows static user data without edit, role, password, delete or activation controls", () => {
    render(<UserMobileCard canManage={false} u={user} actions={{ isToggling: false,
      onRoleChange: vi.fn(), onToggleStatus: vi.fn(), onEdit: vi.fn(), onSetPassword: vi.fn(), onDelete: vi.fn(),
    }} />);
    expect(screen.getByText("Ventas")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("full access still protects the last active administrator", () => {
    render(<UserMobileCard canManage u={{ ...user, role: "admin" }} actions={{ isToggling: false, lastAdminId: user.user_id,
      onRoleChange: vi.fn(), onToggleStatus: vi.fn(), onEdit: vi.fn(), onSetPassword: vi.fn(), onDelete: vi.fn(),
    }} />);
    const role = screen.getByRole("combobox");
    const status = screen.getByRole("switch", { name: "Estado de Persona de prueba" });
    expect(role).toBeDisabled();
    expect(status).toBeDisabled();
    expect(status).toBeChecked();
    expect(role).toHaveAccessibleDescription(/único administrador activo/);
    expect(status).toHaveAccessibleDescription(/rol y estado están protegidos/);
    expect(screen.queryByRole("button", { name: "Eliminar usuario" })).not.toBeInTheDocument();
  });

  it.each(["ventas", null] as const)("cancelar conserva el rol vigente %s sin enviar cambios", async (role) => {
    render(<Harness u={{ ...user, role }} />);
    const original = screen.getByRole("combobox").textContent;
    await proposeRole();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByRole("combobox").textContent).toBe(original);
    expect(updateRole.mutateAsync).not.toHaveBeenCalled();
  });

  it("un fallo conserva el rol anterior y una actualización confirmada sí cambia el selector", async () => {
    updateRole.mutateAsync.mockRejectedValueOnce(new Error("No se pudo guardar"));
    const { rerender } = render(<Harness />);
    await proposeRole();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar Cambio" }));
    await waitFor(() => expect(updateRole.mutateAsync).toHaveBeenCalledWith({ userId: "user-1", role: "mechanic" }));
    expect(screen.getByRole("combobox")).toHaveTextContent("Ventas");

    rerender(<Harness u={{ ...user, role: "mechanic" }} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Mecánico");
  });
});

it("muestra el estado inactivo en lectura y usa el correo como nombre alternativo", () => {
  const inactive = { ...user, is_active: false, full_name: null };
  const actions = {
    isToggling: false, onRoleChange: vi.fn(), onToggleStatus: vi.fn(),
    onEdit: vi.fn(), onSetPassword: vi.fn(), onDelete: vi.fn(),
  };
  const view = render(<UserMobileCard canManage={false} u={inactive} actions={actions} />);
  expect(screen.getByText("Inactivo")).toBeVisible();
  expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  view.rerender(<UserMobileCard canManage u={inactive} actions={actions} />);
  expect(screen.getByRole("switch", { name: "Estado de qa@example.test" })).not.toBeChecked();
});
