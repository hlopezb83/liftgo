import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestRouter } from "@/test/router";
import { describeBusinessBlock } from "@/lib/rules/businessBlocks";
import { BookingActions } from "../BookingActions";

const state = vi.hoisted(() => ({
  isAdmin: true,
  level: "full" as "full" | "read" | "none",
  returnBlock: null as unknown,
  isEarly: false,
  deletePending: false,
  cancelPending: false,
}));
const navigate = vi.fn();
const setStatusDialogOpen = vi.fn();
const setExtendOpen = vi.fn();
const handleCancel = vi.fn();

vi.mock("@/features/users", () => ({
  useUserRole: () => ({ data: state.isAdmin ? "admin" : "ventas" }),
  useRolePermissions: () => ({ data: [] }),
  getAccessLevel: () => state.level,
}));
vi.mock("../../../hooks/bookingActions/returnActionAvailability", () => ({
  returnActionAvailability: () => ({ block: state.returnBlock, isEarly: state.isEarly }),
}));
vi.mock("../../../hooks/bookingActions/useBookingActionsLogic", async (orig) => {
  const actual = await orig<typeof import("../../../hooks/bookingActions/useBookingActionsLogic")>();
  const { useState } = await import("react");
  return {
    ...actual,
    useBookingActionsLogic: () => {
      const [statusOpen, setStatusOpen] = useState(false);
      const [extendOpen, setExtendOpenState] = useState(false);
      return {
        isAdmin: state.isAdmin, navigate,
        extendOpen,
        setExtendOpen: (v: boolean) => { setExtendOpen(v); setExtendOpenState(v); },
        statusDialogOpen: statusOpen,
        setStatusDialogOpen: (v: boolean) => { setStatusDialogOpen(v); setStatusOpen(v); },
        newStatus: "", setNewStatus: vi.fn(),
        newEndDate: undefined, setNewEndDate: vi.fn(),
        extendPreview: null,
        handleDelete: vi.fn(), handleCancel, handleStatusChange: vi.fn(), handleExtend: vi.fn(),
        deleteBookingPending: state.deletePending, cancelBookingPending: state.cancelPending, extendBookingPending: false,
      };
    },
  };
});

const booking = (status = "confirmed") => ({
  id: "bk-1", status, customer_name: "Cliente Demo", start_date: "2026-07-17", end_date: "2026-10-31",
}) as never;

function setup(status = "confirmed") {
  return render(<TestRouter><BookingActions booking={booking(status)} deliveries={[]} transportsLoading={false} transportsError={false} /></TestRouter>);
}

async function openMenu() {
  const trigger = await screen.findByRole("button", { name: "Más acciones" });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  return screen.findByRole("menu");
}

beforeEach(() => {
  Object.assign(state, { isAdmin: true, level: "full", returnBlock: null, isEarly: false, deletePending: false, cancelPending: false });
  vi.clearAllMocks();
});

describe("V09 · acciones de reserva", () => {
  it("confirmada admin: Crear contrato y Extender visibles; resto dentro de Más", async () => {
    setup();
    fireEvent.click(await screen.findByRole("button", { name: "Crear contrato" }));
    expect(navigate).toHaveBeenCalledWith("/contracts/new?booking_id=bk-1");
    expect(screen.getByRole("button", { name: "Extender" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /devolución|eliminar|cancelar/i })).toBeNull();
    const menu = await openMenu();
    for (const name of [/Registrar devolución/, /Cambiar estatus/, /Eliminar/, /Cancelar reserva/]) {
      expect(within(menu).getByRole("menuitem", { name })).toBeInTheDocument();
    }
    expect(within(menu).getByText("En reserva confirmada sólo permite cancelar")).toBeInTheDocument();
  });

  it("devolución navega con early=1 cuando aplica", async () => {
    state.isEarly = true;
    setup();
    fireEvent.click(within(await openMenu()).getByRole("menuitem", { name: /Devolución Anticipada/ }));
    expect(navigate).toHaveBeenCalledWith("/returns?booking_id=bk-1&early=1");
  });

  it("bloqueos de devolución y eliminación siguen enfocables con motivo y no ejecutan", async () => {
    const block = describeBusinessBlock("booking_not_final_for_delete");
    state.returnBlock = describeBusinessBlock("maintenance_open_damage");
    setup();
    const menu = await openMenu();
    const del = within(menu).getByRole("menuitem", { name: /Eliminar/ });
    expect(del).toHaveAttribute("aria-disabled", "true");
    expect(del).not.toHaveAttribute("data-disabled");
    expect(del).toHaveTextContent(block.nextStep);
    fireEvent.click(del);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    const ret = within(menu).getByRole("menuitem", { name: /Registrar devolución/ });
    expect(ret).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(ret);
    expect(navigate).not.toHaveBeenCalled();
    expect(within(menu).queryAllByRole("button")).toHaveLength(0);
  });

  it("rol de consulta: sin contrato/extender/admin; cancelar bloqueado con motivo", async () => {
    Object.assign(state, { isAdmin: false, level: "read" });
    setup();
    expect(screen.queryByRole("button", { name: "Crear contrato" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Extender" })).toBeNull();
    const menu = await openMenu();
    expect(within(menu).queryByRole("menuitem", { name: /Cambiar estatus|Eliminar|devolución/i })).toBeNull();
    const cancel = within(menu).getByRole("menuitem", { name: /Cancelar reserva/ });
    expect(cancel).toHaveAttribute("aria-disabled", "true");
    expect(cancel).toHaveTextContent(/solo puede consultar/);
  });

  it("cancelación en curso: aria-disabled y no abre diálogo", async () => {
    state.cancelPending = true;
    setup();
    const item = within(await openMenu()).getByRole("menuitem", { name: /Cancelar reserva/ });
    expect(item).toHaveAttribute("data-disabled");
    expect(item).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(item);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(handleCancel).not.toHaveBeenCalled();
  });

  it("eliminación en curso (admin, completada): aria-disabled y no abre confirmación", async () => {
    state.deletePending = true;
    setup("completed");
    const item = within(await openMenu()).getByRole("menuitem", { name: /Eliminar/ });
    expect(item).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(item);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it.each(["confirmed", "completed"])("menú %s acotado al alto disponible con scroll y ancho al viewport", async (status) => {
    setup(status);
    const menu = await openMenu();
    for (const cls of ["max-h-[var(--radix-dropdown-menu-content-available-height)]", "overflow-y-auto", "max-w-[calc(100vw-1rem)]"]) {
      expect(menu.className).toContain(cls);
    }
  });

  it("Escape en menú sin selección vuelve al disparador sin acciones", async () => {
    setup();
    await openMenu();
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    expect(screen.getByRole("button", { name: "Más acciones" })).toHaveFocus();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("Cancelar reserva abre diálogo fuera del menú y Escape regresa el foco a Más", async () => {
    setup();
    fireEvent.click(within(await openMenu()).getByRole("menuitem", { name: /Cancelar reserva/ }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("¿Cancelar esta reserva?");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(screen.getByRole("button", { name: "Más acciones" })).toHaveFocus());
    expect(handleCancel).not.toHaveBeenCalled();
  });

  it("Cambiar estatus abre diálogo y Escape devuelve foco a Más", async () => {
    setup();
    fireEvent.click(within(await openMenu()).getByRole("menuitem", { name: /Cambiar estatus/ }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(screen.getByRole("button", { name: "Más acciones" })).toHaveFocus());
  });

  it("Extender abre su diálogo y Cancelar devuelve foco al disparador persistente", async () => {
    setup();
    const trigger = await screen.findByRole("button", { name: "Extender" });
    vi.spyOn(trigger, "getClientRects").mockReturnValue([new DOMRect()] as unknown as DOMRectList);
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Extender Reserva" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("completada/cancelada sin admin: ninguna acción", () => {
    state.isAdmin = false;
    const { container } = setup("completed");
    expect(container).toBeEmptyDOMElement();
  });
  it.each(["completed", "cancelled", "unknown"])("%s admin: blocks status changes without transitions", async (status) => {
    setup(status);
    const menu = await openMenu();
    const change = within(menu).getByRole("menuitem", { name: /Cambiar estatus/ });
    expect(change).toHaveAttribute("aria-disabled", "true");
    expect(change).toHaveTextContent("No hay cambios de estatus disponibles para esta reserva");
    fireEvent.click(change);
    expect(setStatusDialogOpen).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("completada admin: menú sólo con Cambiar estatus y Eliminar habilitado", async () => {
    setup("completed");
    const menu = await openMenu();
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(2);
    const del = within(menu).getByRole("menuitem", { name: /Eliminar/ });
    expect(del).not.toHaveAttribute("aria-disabled");
    fireEvent.click(del);
    expect(await screen.findByRole("alertdialog")).toHaveTextContent("¿Eliminar esta reserva?");
  });
});
