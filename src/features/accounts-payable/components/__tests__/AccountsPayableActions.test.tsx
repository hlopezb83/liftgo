import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestRouter } from "@/test/router";
import { AccountsPayableActions } from "../AccountsPayableActions";

const access = vi.hoisted(() => ({ level: "full" }));
vi.mock("@/features/users", () => ({
  useUserRole: () => ({ data: "admin" }),
  useRolePermissions: () => ({ data: [] }),
  getAccessLevel: () => access.level,
}));

function setup(overrides: Partial<Parameters<typeof AccountsPayableActions>[0]> = {}) {
  const callbacks = { onCreate: vi.fn(), onExport: vi.fn(), onBatches: vi.fn(), onRelease: vi.fn() };
  render(<TestRouter><AccountsPayableActions releasableLocks={2} isReleasing={false} canManageBatches {...callbacks} {...overrides} /></TestRouter>);
  return callbacks;
}

async function openMenu() {
  const trigger = await screen.findByRole("button", { name: "Más acciones" });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  return screen.findByRole("menu");
}

describe("V02 · acciones de proveedor", () => {
  beforeEach(() => { access.level = "full"; });

  it("mantiene la creación directa y cada callback secundario se ejecuta una vez", async () => {
    const callbacks = setup();
    fireEvent.click(await screen.findByRole("button", { name: "Nueva factura" }));
    expect(callbacks.onCreate).toHaveBeenCalledTimes(1);
    for (const [label, callback] of [
      ["Exportar pagos", callbacks.onExport],
      ["Historial de lotes", callbacks.onBatches],
      ["Liberar bloqueos de pago", callbacks.onRelease],
    ] as const) {
      await openMenu();
      fireEvent.click(screen.getByRole("menuitem", { name: label }));
      expect(callback).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    }
  });

  it("lectura conserva Antigüedad y oculta creación, lotes y liberación", async () => {
    access.level = "read";
    setup();
    await openMenu();
    expect(screen.getByRole("menuitem", { name: "Antigüedad" })).toHaveAttribute("href", "/cuentas-por-pagar/antiguedad");
    expect(screen.getAllByRole("menuitem")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Nueva factura" })).toBeNull();
  });

  it("sin gestión de lotes oculta exportación e historial, sin ocultar liberación permitida", async () => {
    setup({ canManageBatches: false });
    await openMenu();
    expect(screen.queryByRole("menuitem", { name: "Exportar pagos" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Historial de lotes" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Liberar bloqueos de pago" })).toBeInTheDocument();
  });

  it("sin bloqueos no ofrece liberación ni su separador", async () => {
    setup({ releasableLocks: 0 });
    await openMenu();
    expect(screen.queryByRole("menuitem", { name: "Liberar bloqueos de pago" })).toBeNull();
    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("durante liberación deshabilita la acción y no invoca el callback", async () => {
    const callbacks = setup({ isReleasing: true });
    await openMenu();
    const item = screen.getByRole("menuitem", { name: "Liberar bloqueos de pago" });
    expect(item).toHaveAttribute("data-disabled");
    fireEvent.click(item);
    expect(callbacks.onRelease).not.toHaveBeenCalled();
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("abre con teclado y Escape devuelve el foco sin ejecutar acciones", async () => {
    const callbacks = setup();
    await openMenu();
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Antigüedad" })).toHaveFocus());
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await waitFor(() => expect(screen.getByRole("button", { name: "Más acciones" })).toHaveFocus());
    for (const callback of Object.values(callbacks)) expect(callback).not.toHaveBeenCalled();
  });
});