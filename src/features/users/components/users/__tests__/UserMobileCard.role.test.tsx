import { useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRow } from "../../../hooks/useUserManagement";
import type { AppRole } from "../../../hooks/useUserRole";
import { RoleChangeDialog } from "../RoleChangeDialog";
import { UserMobileCard } from "../UserMobileCard";

const updateRole = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
vi.mock("../../../hooks/useUserManagement", () => ({ useUpdateRole: () => updateRole }));

const user: UserRow = {
  user_id: "user-1", full_name: "Persona de prueba", email: "qa@example.test",
  created_at: "2026-01-01T12:00:00Z", role: "ventas", is_active: true,
};

function Harness({ u = user }: { u?: UserRow }) {
  const [target, setTarget] = useState<{ user: UserRow; newRole: AppRole } | null>(null);
  return <>
    <UserMobileCard u={u} actions={{
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
