import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DeliveryFormFields, type DeliveryFormValues } from "../DeliveryFormFields";

const forklifts = [
  { id: "f1", name: "MTY-FD50-01", model: "FD50" },
  { id: "f2", name: "MTY-FD30-02", model: "FD30" },
];
const bookings = [
  { id: "b1", booking_number: "RSV-0001", customer_name: "Alcore", start_date: "2026-11-01", end_date: "2026-11-05", forklift_id: "f1", status: "confirmed" },
  { id: "b2", booking_number: "RSV-0002", customer_name: "Hyva", start_date: "2026-11-10", end_date: "2026-11-15", forklift_id: "f2", status: "confirmed" },
];
type Driver = { id: string; name: string; phone: string | null };
const drivers: Driver[] = [
  { id: "d1", name: "Diego Salinas", phone: "8180000001" },
  { id: "d2", name: "Marcos Rivera", phone: "8180000002" },
  { id: "d3", name: "Luis Treviño", phone: null },
];

function Harness({ activeDrivers = drivers, rows = bookings }: { activeDrivers?: Driver[]; rows?: typeof bookings }) {
  const form = useForm<DeliveryFormValues>({
    defaultValues: {
      forkliftId: "", bookingId: "", type: "delivery", alreadyCompleted: false,
      scheduledDate: new Date(2026, 8, 24), scheduledTime: "",
      address: "", driverName: "", driverPhone: "", notes: "", noEvidenceReason: "",
    },
  });
  return <DeliveryFormFields form={form} forklifts={forklifts} bookings={rows} activeDrivers={activeDrivers} />;
}

async function choose(label: string, option: string | RegExp) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: label }), { key: "Enter" });
  const item = await screen.findByRole("option", { name: option });
  await act(async () => { fireEvent.click(item); });
}

const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
});
afterAll(() => {
  if (originalScroll) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScroll);
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-24T18:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("DeliveryFormFields · selecciones relacionadas", () => {
  it("asigna el equipo de la reserva seleccionada", async () => {
    render(<Harness />);
    await choose("Reserva Vinculada", /Alcore/);
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Montacargas" })).toHaveTextContent("MTY-FD50-01"));
    expect(screen.getByRole("combobox", { name: "Reserva Vinculada" })).toHaveTextContent("Alcore");
  });

  it("conserva el nuevo equipo y limpia sólo la reserva incompatible", async () => {
    render(<Harness />);
    await choose("Reserva Vinculada", /Alcore/);
    await choose("Montacargas", /MTY-FD30-02/);
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Montacargas" })).toHaveTextContent("MTY-FD30-02"));
    expect(screen.getByRole("combobox", { name: "Reserva Vinculada" })).toHaveTextContent("Seleccionar reserva");
    await choose("Reserva Vinculada", /Hyva/);
    expect(screen.getByRole("combobox", { name: "Montacargas" })).toHaveTextContent("MTY-FD30-02");
    expect(screen.getByRole("combobox", { name: "Reserva Vinculada" })).toHaveTextContent("Hyva");
  });

  it("pone la reserva primero y distingue folios del mismo cliente, equipo y periodo", async () => {
    render(<Harness rows={[...bookings, { ...bookings[0], id: "b3", booking_number: "RSV-0020" }]} />);
    const reservation = screen.getByRole("combobox", { name: "Reserva Vinculada" });
    expect(reservation.compareDocumentPosition(screen.getByRole("combobox", { name: "Montacargas" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await choose("Reserva Vinculada", /RSV-0020 · Alcore · MTY-FD50-01 · 01\/11\/2026/);
    expect(reservation).toHaveTextContent("RSV-0020");
    expect(screen.getByRole("combobox", { name: "Montacargas" })).toHaveTextContent("MTY-FD50-01");
  });

  it("permite cambiar directamente a una reserva de otro equipo", async () => {
    render(<Harness />);
    await choose("Reserva Vinculada", /RSV-0001/);
    await choose("Reserva Vinculada", /RSV-0002/);
    expect(screen.getByRole("combobox", { name: "Montacargas" })).toHaveTextContent("MTY-FD30-02");
  });

  it("conserva una fecha válida capturada al cambiar de reserva y refrescar opciones", async () => {
    const view = render(<Harness rows={[...bookings, { ...bookings[0], id: "b3", booking_number: "RSV-0020" }]} />);
    await choose("Reserva Vinculada", /RSV-0001/);
    const date = screen.getByRole("textbox", { name: /Fecha de entrega/ });
    fireEvent.change(date, { target: { value: "03112026" } });
    fireEvent.blur(date);
    await choose("Reserva Vinculada", /RSV-0020/);
    expect(date).toHaveValue("03/11/2026");
    view.rerender(<Harness rows={bookings.map((b) => ({ ...b }))} />);
    expect(date).toHaveValue("03/11/2026");
  });

  it("reemplaza el teléfono al elegir otro conductor", async () => {
    render(<Harness />);
    await choose("Conductor", "Diego Salinas");
    expect(screen.getByLabelText("Teléfono del conductor")).toHaveValue("8180000001");
    await choose("Conductor", "Marcos Rivera");
    expect(screen.getByLabelText("Teléfono del conductor")).toHaveValue("8180000002");
    expect(screen.getByLabelText("Teléfono del conductor")).toHaveAttribute("type", "tel");
  });

  it.each([null, ""])("no conserva el teléfono anterior si el nuevo conductor tiene %s", async (phone) => {
    render(<Harness activeDrivers={drivers.map((d) => d.id === "d3" ? { ...d, phone } : d)} />);
    await choose("Conductor", "Diego Salinas");
    await choose("Conductor", "Luis Treviño");
    expect(screen.getByLabelText("Teléfono del conductor")).toHaveValue("");
  });

  it("conserva una corrección manual cuando se actualiza el catálogo", async () => {
    const { rerender } = render(<Harness />);
    await choose("Conductor", "Diego Salinas");
    fireEvent.change(screen.getByLabelText("Teléfono del conductor"), { target: { value: "8180000099" } });
    rerender(<Harness activeDrivers={drivers.map((d) => ({ ...d }))} />);
    expect(screen.getByLabelText("Teléfono del conductor")).toHaveValue("8180000099");
  });

  it("explica la ausencia de conductores en lugar de abrir una lista vacía", () => {
    render(<Harness activeDrivers={[]} />);
    expect(screen.getByRole("combobox", { name: "Conductor" })).toBeDisabled();
    expect(screen.getByText("No hay conductores activos registrados.")).toBeInTheDocument();
  });
});
