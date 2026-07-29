import type { ReactNode } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DeliveryActions } from "../DeliveryActions";

/**
 * DB3-15 (FE4-06): el guard SQL rechaza borrar una entrega 'completed', y
 * exige rol admin para borrar una 'scheduled'. El componente debe ocultar
 * el botón "Eliminar" en vez de dejar que el clic truene con el error SQL.
 */

const roleGuardAccessMock = vi.fn<[], boolean>(() => true);

vi.mock("@/layouts/RoleGuard", () => ({
  RoleGuard: ({ children, fallback }: { children: ReactNode; fallback: ReactNode }) =>
    roleGuardAccessMock() ? <>{children}</> : <>{fallback}</>,
}));

function renderActions(status: string, canDelete: boolean) {
  render(
    <DeliveryActions
      status={status}
      canDelete={canDelete}
      onComplete={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
}

describe("DeliveryActions - botón Eliminar (DB3-15)", () => {
  it("se oculta cuando canDelete es false (entrega completed)", () => {
    renderActions("completed", false);
    expect(screen.queryByRole("button", { name: /eliminar/i })).not.toBeInTheDocument();
  });

  it("se muestra cuando canDelete es true y el usuario tiene acceso completo", () => {
    roleGuardAccessMock.mockReturnValue(true);
    renderActions("cancelled", true);
    expect(screen.getByRole("button", { name: /eliminar/i })).toBeInTheDocument();
  });

  it("se oculta cuando canDelete es true (scheduled + admin) pero el RoleGuard niega el acceso", () => {
    roleGuardAccessMock.mockReturnValue(false);
    renderActions("scheduled", true);
    expect(screen.queryByRole("button", { name: /eliminar/i })).not.toBeInTheDocument();
  });

  it("siempre muestra 'Completar' salvo cuando el status ya es completed", () => {
    roleGuardAccessMock.mockReturnValue(true);
    renderActions("scheduled", true);
    expect(screen.getByRole("button", { name: /completar/i })).toBeInTheDocument();

    renderActions("completed", false);
    expect(screen.queryAllByRole("button", { name: /completar/i })).toHaveLength(1);
  });

  it("al confirmar el diálogo, invoca onDelete", () => {
    roleGuardAccessMock.mockReturnValue(true);
    const onDelete = vi.fn();
    render(
      <DeliveryActions status="cancelled" canDelete onComplete={vi.fn()} onDelete={onDelete} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /eliminar/i }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Eliminar" }));
    expect(onDelete).toHaveBeenCalled();
  });
});
