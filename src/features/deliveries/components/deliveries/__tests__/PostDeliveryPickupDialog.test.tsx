import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostDeliveryPickupDialog } from "../PostDeliveryPickupDialog";

const mutation = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const notifySuccess = vi.hoisted(() => vi.fn());
vi.mock("../../../hooks/useDeliveries", () => ({ useCreateDelivery: () => mutation }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifySuccess }));

const source = {
  forklift_id: "forklift-1", booking_id: "booking-1",
  address: "Av. Industrial 123", driver_name: "Diego Salinas",
  driver_phone: "+52 8112345678", hours_reading: 1500,
};
const baseProps = {
  open: true, delivery: source, bookingEndDate: "2026-09-24", forkliftName: "MTY-FD50-01",
};

beforeEach(() => {
  vi.clearAllMocks();
  mutation.isPending = false;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-24T18:00:00Z"));
});
afterEach(() => vi.useRealTimers());

function setup() {
  const onOpenChange = vi.fn();
  const props = { ...baseProps, onOpenChange };
  const result = render(<PostDeliveryPickupDialog {...props} />);
  return { ...result, props, onOpenChange };
}

function openForm() {
  fireEvent.click(screen.getByRole("button", { name: "Programar recolección" }));
}

async function submit() {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Programar recolección" })); });
}

describe("PostDeliveryPickupDialog", () => {
  it("permite omitir el ofrecimiento sin guardar una recolección", () => {
    const { onOpenChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Omitir por ahora" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it.each(["Cancelar", "Cerrar", "Escape"])("protege cambios sin guardar al usar %s", (action) => {
    const { onOpenChange } = setup();
    openForm();
    fireEvent.change(screen.getByRole("textbox", { name: "Notas" }), { target: { value: "Acceso por patio norte" } });
    if (action === "Escape") fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    else fireEvent.click(screen.getByRole("button", { name: action }));
    expect(screen.getByText("¿Descartar cambios?")).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(screen.getByRole("textbox", { name: "Notas" })).toHaveValue("Acceso por patio norte");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it("bloquea cancelar, cerrar y un nuevo envío durante la mutación", async () => {
    const { props, rerender, onOpenChange } = setup();
    openForm();
    mutation.isPending = true;
    rerender(<PostDeliveryPickupDialog {...props} />);
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    const form = screen.getByRole("textbox", { name: "Notas" }).closest("form");
    if (!form) throw new Error("Formulario ausente");
    await act(async () => { fireEvent.submit(form); });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it("impide enviar una fecha que quedó en el pasado durante la sesión", async () => {
    setup();
    openForm();
    vi.setSystemTime(new Date("2026-09-25T18:00:00Z"));
    await submit();
    expect(await screen.findByText("La recolección debe programarse para hoy o una fecha futura")).toBeInTheDocument();
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it("bloquea fechas pasadas introducidas con teclado", () => {
    setup();
    openForm();
    fireEvent.change(screen.getByRole("textbox", { name: "Fecha de recolección" }), { target: { value: "2026-09-23" } });
    expect(screen.getByText("Esta fecha no está permitida")).toBeInTheDocument();
  });

  it("conserva reserva y equipo y sólo cierra al completar la creación", async () => {
    const { onOpenChange } = setup();
    openForm();
    fireEvent.change(screen.getByRole("textbox", { name: "Notas" }), { target: { value: "Acceso por patio norte" } });
    await submit();
    expect(mutation.mutate).toHaveBeenCalledOnce();
    expect(mutation.mutate).toHaveBeenCalledWith({
      forklift_id: "forklift-1", booking_id: "booking-1", type: "pickup",
      scheduled_date: "2026-09-24", scheduled_time: null,
      address: source.address, driver_name: source.driver_name, driver_phone: source.driver_phone,
      notes: "Acceso por patio norte", hours_reading: null,
    }, expect.objectContaining({ onSuccess: expect.any(Function) }));
    expect(onOpenChange).not.toHaveBeenCalled();
    await act(async () => { mutation.mutate.mock.calls[0][1].onSuccess(); });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(notifySuccess).toHaveBeenCalledWith("Recolección programada");
  });

  it("renueva el borrador y la fecha al volver a abrir", () => {
    const { props, rerender } = setup();
    openForm();
    fireEvent.change(screen.getByRole("textbox", { name: "Notas" }), { target: { value: "Borrador anterior" } });
    rerender(<PostDeliveryPickupDialog {...props} open={false} />);
    vi.setSystemTime(new Date("2026-09-25T18:00:00Z"));
    rerender(<PostDeliveryPickupDialog {...props} />);
    openForm();
    expect(screen.getByRole("textbox", { name: "Notas" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Fecha de recolección" })).toHaveValue("25/09/2026");
  });
});
