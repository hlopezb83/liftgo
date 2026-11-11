import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ allowed: true, hook: vi.fn(), refresh: vi.fn() }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => mocks.allowed }));
vi.mock("../../../hooks/forklifts/useAvailabilityReasons", () => ({ useAvailabilityReasons: mocks.hook }));
vi.mock("@/lib/router-compat-ui", () => ({ Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => <a href={to} {...props}>{children}</a> }));
import { EquipmentAvailabilityLookup } from "../EquipmentAvailabilityLookup";

const equipment = [{ id: "f1", name: "Unidad A" }];
const dates = { from: new Date(2026, 10, 10), to: new Date(2026, 10, 12) };
const unit = { ...equipment[0], model: "FD50", status: "rented", organization_id: "org-a" };
const ready = { allowed: true, isFetching: false, isPending: false, isError: false, refresh: mocks.refresh,
  data: { unavailable: [], availableUnits: [unit], reservableWhileRented: [unit], evidenceIncomplete: false } };

beforeEach(() => { mocks.allowed = true; mocks.hook.mockReset().mockReturnValue(ready); mocks.refresh.mockReset(); });

describe("EquipmentAvailabilityLookup", () => {
  it("does not mount the lookup until opened, and returns focus to its trigger", async () => {
    render(<EquipmentAvailabilityLookup equipment={equipment} initialRange={dates} />);
    const trigger = screen.getByRole("button", { name: "Consultar disponibilidad por fechas" });
    expect(mocks.hook).not.toHaveBeenCalled();
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Disponibilidad por fechas" })).toBeInTheDocument();
    expect(mocks.hook).toHaveBeenLastCalledWith(dates, true, "f1");
    expect(screen.getByText("Estado operativo: Rentado")).toBeInTheDocument();
    expect(screen.getByText("Disponible para reservar en las fechas seleccionadas")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("requires dates and does not present a cached result before they are selected", () => {
    render(<EquipmentAvailabilityLookup equipment={equipment} />);
    fireEvent.click(screen.getByRole("button", { name: "Consultar disponibilidad por fechas" }));
    expect(mocks.hook).toHaveBeenLastCalledWith(undefined, false, "f1");
    expect(screen.getByText("Selecciona equipo y ambas fechas para consultar.")).toBeInTheDocument();
    expect(screen.queryByText(/Disponible para reservar/)).not.toBeInTheDocument();
  });

  it("shows only a verified cause link, and preserves error/retry feedback", () => {
    const unavailable = [{ unit, bookingId: "b1", reason: { code: "reservation", label: "Reserva en las fechas seleccionadas", detail: "Reserva confirmada.", nextAction: "Elige otras fechas." } }];
    mocks.hook.mockReturnValue({ ...ready, data: { ...ready.data, availableUnits: [], unavailable } });
    const { rerender } = render(<EquipmentAvailabilityLookup equipment={equipment} initialRange={dates} />);
    fireEvent.click(screen.getByRole("button", { name: "Consultar disponibilidad por fechas" }));
    expect(screen.getByRole("link", { name: "Ver reserva que explica el bloqueo" })).toHaveAttribute("href", "/bookings/b1");
    mocks.hook.mockReturnValue({ ...ready, isError: true });
    rerender(<EquipmentAvailabilityLookup equipment={equipment} initialRange={dates} />);
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron verificar");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Actualizar motivos" }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("hides the lookup without fleet read permission", () => {
    mocks.allowed = false;
    render(<EquipmentAvailabilityLookup equipment={equipment} initialRange={dates} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(mocks.hook).not.toHaveBeenCalled();
  });
});
