import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
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
    useHasFinancialAccess: () => roleRef.current !== "dispatcher",
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

function renderCard(targetBooking: never) {
  return render(
    <TooltipProvider>
      <BookingBillingCard booking={targetBooking} />
    </TooltipProvider>,
  );
}

describe("BookingBillingCard — permisos y elegibilidad de recurrencia", () => {
  beforeEach(() => vi.clearAllMocks());

  it("administrativo (Facturas full) ve habilitado el interruptor para un periodo elegible", () => {
    roleRef.current = "administrativo";
    renderCard(booking);
    expect(screen.getByLabelText("Activar facturación recurrente mensual")).toBeEnabled();
  });

  it("dispatcher (Reservas full) no ve controles ni tarjeta de facturación", () => {
    roleRef.current = "dispatcher";
    renderCard(booking);
    expect(screen.queryByLabelText("Activar facturación recurrente mensual")).toBeNull();
    expect(screen.queryByText("Facturación")).toBeNull();
  });

  it("conserva estado operativo de devolución para dispatcher", () => {
    roleRef.current = "dispatcher";
    renderCard({ ...bookingData, return_status: "pending" } as never);
    expect(screen.getByText("Estado de devolución")).toBeInTheDocument();
    expect(screen.queryByText("Facturación")).toBeNull();
  });

  it("ventas (solo lectura) no ve el interruptor", () => {
    roleRef.current = "ventas";
    renderCard(booking);
    expect(screen.queryByLabelText("Activar facturación recurrente mensual")).toBeNull();
  });

  it("no permite activar recurrencia en una reserva menor a un mes calendario", () => {
    roleRef.current = "administrativo";
    const shortBooking = { ...bookingData, end_date: "2026-10-30" } as never;
    renderCard(shortBooking);

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
    renderCard(legacyBooking);

    expect(screen.getByLabelText("Activar facturación recurrente mensual")).toBeEnabled();
  });
});

it("distinguishes preserved monthly modality from stopped automatic billing after return", () => {
  roleRef.current = "administrativo";
  renderCard({ ...bookingData, status: "completed", recurring_billing: true } as never);
  expect(screen.getByText("Modalidad mensual")).toBeInTheDocument();
  expect(screen.getByText(/Facturación automática detenida/)).toBeInTheDocument();
  expect(screen.queryByLabelText("Activar facturación recurrente mensual")).toBeNull();
  expect(screen.queryByText("Recurrente")).toBeNull();
  expect(screen.queryByText(/Próx. factura/)).toBeNull();
});


it("does not reinterpret cancelled nonrecurring bookings as monthly", () => {
  roleRef.current = "administrativo";
  renderCard({ ...bookingData, status: "cancelled", recurring_billing: false } as never);
  expect(screen.getByText("No activa")).toBeInTheDocument();
  expect(screen.queryByText("Modalidad mensual")).toBeNull();
  expect(screen.queryByText(/Facturación automática detenida/)).toBeNull();
  expect(screen.queryByLabelText("Activar facturación recurrente mensual")).toBeNull();
});
