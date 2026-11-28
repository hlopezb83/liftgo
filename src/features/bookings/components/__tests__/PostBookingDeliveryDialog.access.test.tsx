import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostBookingDeliveryDialog } from "../PostBookingDeliveryDialog";

const state = vi.hoisted(() => ({ full: false, mutate: vi.fn() }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => state.full }));
vi.mock("@/features/deliveries", () => ({
  useCreateDelivery: () => ({ mutate: state.mutate, isPending: false }),
  deliveryBookingDateError: () => null,
}));
const props = {
  open: true, onOpenChange: vi.fn(), bookingId: "booking-1", forkliftId: "forklift-1",
  forkliftName: "MTY-LG-2601", startDate: "2026-10-05", endDate: "2026-10-07",
  customerAddress: "Av. Industria 428", onSkip: vi.fn(),
};
beforeEach(() => { state.full = false; vi.clearAllMocks(); });

describe("Programación posterior a reserva: permisos", () => {
  it("Ventas conserva la confirmación de reserva y puede continuar sin formularios de entrega", async () => {
    render(<PostBookingDeliveryDialog {...props} />);
    expect(await screen.findByText(/La reserva está creada. Despacho coordinará/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Programar entrega" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Fecha de Entrega")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(props.onSkip).toHaveBeenCalledOnce();
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it("retira el formulario abierto cuando se pierde el permiso full", async () => {
    state.full = true;
    const view = render(<PostBookingDeliveryDialog {...props} />);
    fireEvent.click(await screen.findByRole("button", { name: "Programar entrega" }));
    expect(screen.getByText("Nombre del Operador")).toBeInTheDocument();
    state.full = false;
    view.rerender(<PostBookingDeliveryDialog {...props} />);
    expect(screen.queryByText("Nombre del Operador")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeInTheDocument();
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it("respeta también la restricción del flujo que lo invoca para varias reservas", async () => {
    state.full = true;
    render(<PostBookingDeliveryDialog {...props} allowScheduling={false} currentIndex={1} totalCount={2} />);
    expect(await screen.findByRole("heading", { name: "Reserva 2 de 2" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Programar entrega" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(props.onSkip).toHaveBeenCalledOnce();
  });
});
