import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EquipmentAssignmentDialog } from "../EquipmentAssignmentDialog";

vi.mock("@/features/availability", () => ({
  computeFleetAvailability: () => ({ rentedForkliftIds: new Set() }),
  useServerTodayMty: () => "2026-09-23",
}));
vi.mock("@/features/bookings", () => ({ useBookings: () => ({ data: [] }) }));
vi.mock("@/features/fleet", () => ({
  useAvailableForklifts: () => ({ availableForklifts: [], datesSelected: false }),
}));

describe("EquipmentAssignmentDialog", () => {
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
});

