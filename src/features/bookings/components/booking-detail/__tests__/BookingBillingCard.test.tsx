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

const bookingData = {
  id: "b1",
  status: "confirmed",
  recurring_billing: false,
  version: 1,
  start_date: "2026-10-01",
  end_date: "2026-10-31",
};
const booking = bookingData as never;

describe("BookingBillingCard — permisos y elegibilidad de recurrencia", () => {
  beforeEach(() => vi.clearAllMocks());

  it("administrativo (Facturas full) ve habilitado el interruptor para un periodo elegible", () => {
    roleRef.current = "administrativo";
    render(<BookingBillingCard booking={booking} />);
    expect(screen.getByLabelText("Activar facturación recurrente mensual")).toBeEnabled();
  });

  it("dispatcher (Reservas full) sigue viendo el interruptor", () => {
    roleRef.current = "dispatcher";
    render(<BookingBillingCard booking={booking} />);
    expect(screen.getByLabelText("Activar facturación recurrente mensual")).toBeEnabled();
  });

  it("ventas (solo lectura) no ve el interruptor", () => {
    roleRef.current = "ventas";
    render(<BookingBillingCard booking={booking} />);
    expect(screen.queryByLabelText("Activar facturación recurrente mensual")).toBeNull();
  });

  it("no permite activar recurrencia en una reserva menor a un mes calendario", () => {
    roleRef.current = "administrativo";
    const shortBooking = { ...bookingData, end_date: "2026-10-30" } as never;
    render(<BookingBillingCard booking={shortBooking} />);

    expect(screen.getByLabelText("Activar facturación recurrente mensual")).toBeDisabled();
    expect(screen.getByText("Para activarla, la reserva debe cubrir al menos un mes calendario.")).toBeInTheDocument();
  });

  it("permite desactivar una recurrencia histórica aunque la reserva sea corta", () => {
    roleRef.current = "administrativo";
    const legacyBooking = {
      ...bookingData,
      end_date: "2026-10-30",
      recurring_billing: true,
    } as never;
    render(<BookingBillingCard booking={legacyBooking} />);

    expect(screen.getByLabelText("Activar facturación recurrente mensual")).toBeEnabled();
  });
});
