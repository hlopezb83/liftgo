import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PermissionsMap } from "@/features/users";
import { BookingBillingCard } from "../BookingBillingCard";

const roleRef = { current: "administrativo" as string };
const perms: PermissionsMap = {
  administrativo: { Reservas: "read", Facturas: "full" },
  ventas: { Reservas: "read", Facturas: "none" },
  dispatcher: { Reservas: "full", Facturas: "read" },
};

vi.mock("@/features/users", async () => {
  const actual = await vi.importActual<typeof import("@/features/users")>("@/features/users");
  return {
    ...actual,
    useUserRole: () => ({ data: roleRef.current }),
    useRolePermissions: () => ({ data: perms }),
  };
});

vi.mock("../../../hooks/bookings/useBookingMutations", () => ({
  useUpdateBooking: () => ({ mutate: vi.fn(), isPending: false }),
}));

const booking = {
  id: "b1",
  status: "active",
  recurring_billing: false,
  version: 1,
} as never;

describe("BookingBillingCard — quién puede prender/apagar la recurrencia", () => {
  beforeEach(() => vi.clearAllMocks());

  it("administrativo (Facturas full) ve el interruptor", () => {
    roleRef.current = "administrativo";
    render(<BookingBillingCard booking={booking} />);
    expect(screen.getByLabelText("Activar facturación recurrente mensual")).toBeInTheDocument();
  });

  it("dispatcher (Reservas full) sigue viendo el interruptor", () => {
    roleRef.current = "dispatcher";
    render(<BookingBillingCard booking={booking} />);
    expect(screen.getByLabelText("Activar facturación recurrente mensual")).toBeInTheDocument();
  });

  it("ventas (solo lectura) no ve el interruptor", () => {
    roleRef.current = "ventas";
    render(<BookingBillingCard booking={booking} />);
    expect(screen.queryByLabelText("Activar facturación recurrente mensual")).toBeNull();
  });
});
