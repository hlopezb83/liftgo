import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EquipmentAssignmentDialog } from "../EquipmentAssignmentDialog";

const availability = vi.hoisted(() => ({
  availableForklifts: [], datesSelected: false, isLoading: false,
  isSuccess: false, isError: false, refetch: vi.fn(),
}));

vi.mock("@/features/availability", () => ({
  computeFleetAvailability: () => ({ rentedForkliftIds: new Set() }),
  useServerTodayMty: () => "2026-09-23",
}));
vi.mock("@/features/bookings", () => ({ useBookings: () => ({ data: [] }) }));
vi.mock("@/features/fleet", () => ({
  useAvailableForklifts: () => availability,
}));

describe("EquipmentAssignmentDialog", () => {
  beforeEach(() => {
    Object.assign(availability, {
      datesSelected: false, isLoading: false, isSuccess: false, isError: false,
    });
  });

  it("mantiene abierto el formulario al actualizarse sin reiniciar sus campos", () => {
    const props = {
      open: true,
      onOpenChange: vi.fn(),
      startDate: null,
      endDate: null,
      rentalMeta: [],
      models: [],
      forklifts: [],
      onConfirm: vi.fn(),
    };
    const { rerender } = render(<EquipmentAssignmentDialog {...props} />);
    rerender(<EquipmentAssignmentDialog {...props} />);
    expect(screen.getByRole("heading", { name: "Asignar equipos" })).toBeInTheDocument();
  });

  it("no anuncia falta de unidades mientras consulta disponibilidad", () => {
    Object.assign(availability, { datesSelected: true, isLoading: true });
    render(<EquipmentAssignmentDialog
      open onOpenChange={vi.fn()} startDate="2026-09-25" endDate="2026-09-29"
      rentalMeta={[{ modelId: "m1", quantity: 1 }]} models={[]} forklifts={[]}
      onConfirm={vi.fn()}
    />);
    expect(screen.getByText("Comprobando disponibilidad…")).toBeInTheDocument();
    expect(screen.queryByText(/Sin unidades disponibles para:/)).not.toBeInTheDocument();
  });
});
