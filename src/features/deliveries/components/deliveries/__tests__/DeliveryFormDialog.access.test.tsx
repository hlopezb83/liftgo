import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeliveryFormDialog } from "../DeliveryFormDialog";

const access = vi.hoisted(() => ({ canWrite: false }));

vi.mock("@/features/users", () => ({
  useHasModuleAccess: () => access.canWrite,
}));
vi.mock("@/features/bookings", () => ({ useBookings: () => ({ data: [] }) }));
vi.mock("@/features/fleet", () => ({
  useActiveDrivers: () => ({ data: [] }),
  useForkliftMap: () => ({ forklifts: [] }),
}));
vi.mock("../../../hooks/useDeliveries", () => ({
  useCreateDelivery: () => ({ isPending: false, mutate: vi.fn() }),
}));

describe("DeliveryFormDialog access", () => {
  beforeEach(() => { access.canWrite = false; });

  it("no muestra el formulario aunque se solicite abierto para un auditor", () => {
    render(<DeliveryFormDialog open onOpenChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Programar" })).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("mantiene la acción disponible para usuarios con acceso completo", () => {
    access.canWrite = true;
    render(<DeliveryFormDialog />);
    expect(screen.getByRole("button", { name: "Programar" })).toBeInTheDocument();
  });
});
