import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestRouter } from "@/test/router";
import DeliveryDetail from "../DeliveryDetail";

const mocks = vi.hoisted(() => ({
  booking: vi.fn(), completion: vi.fn(), refetchBooking: vi.fn(),
}));
const delivery = {
  id: "delivery-1", delivery_number: "ENT-0001", booking_id: "old-booking",
  forklift_id: "forklift-1", type: "delivery", status: "scheduled",
};
const booking = { id: "old-booking", booking_number: "RSV-0001", end_date: "2026-11-13" };

vi.mock("@/features/bookings", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/features/bookings")>(),
  useBooking: (id: string) => mocks.booking(id),
  useBookings: () => { throw new Error("El detalle no debe depender del listado limitado"); },
}));
vi.mock("@/features/fleet", () => ({
  useForkliftMap: () => ({ forkliftMap: new Map() }),
}));
vi.mock("@/features/users", () => ({ useUserRole: () => ({ data: "admin" }) }));
vi.mock("../../hooks/useDeliveries", () => ({
  useDelivery: () => ({ data: delivery, isLoading: false, isError: false }),
  useDeliveries: () => ({ data: [] }),
  useDeleteDelivery: () => ({ mutate: vi.fn() }),
}));
vi.mock("../../hooks/useDeliveryCompletion", () => ({
  useDeliveryCompletion: (...args: unknown[]) => { mocks.completion(...args); return {}; },
}));
vi.mock("../../components/deliveries/DeliveryActions", () => ({
  DeliveryActions: () => <button>Reprogramar</button>,
}));
vi.mock("../../components/deliveries/DeliveryDetailBody", () => ({
  DeliveryDetailBody: ({ linkedBooking }: { linkedBooking: { booking_number: string } }) => <p>{linkedBooking.booking_number}</p>,
}));
vi.mock("../../components/deliveries/DeliveryDetailDialogs", () => ({ DeliveryDetailDialogs: () => null }));
vi.mock("../../components/deliveries/RescheduleDeliveryDialog", () => ({ RescheduleDeliveryDialog: () => null }));

function renderPage() {
  return render(
    <TestRouter initialEntries={["/deliveries/delivery-1"]} path="/deliveries/$id">
      <DeliveryDetail />
    </TestRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.booking.mockReturnValue({
    data: booking, isLoading: false, isError: false, refetch: mocks.refetchBooking,
  });
});

describe("DeliveryDetail · reserva vinculada", () => {
  it("consulta la reserva por ID aunque quede fuera del listado", async () => {
    renderPage();
    expect(await screen.findByText("RSV-0001")).toBeInTheDocument();
    expect(mocks.booking).toHaveBeenCalledWith("old-booking");
    expect(mocks.completion).toHaveBeenCalledWith(delivery, [], booking, undefined);
  });

  it("impide operar sin contexto mientras se carga la reserva", async () => {
    mocks.booking.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    renderPage();
    await waitFor(() => expect(mocks.booking).toHaveBeenCalledWith("old-booking"));
    expect(screen.queryByRole("button", { name: "Reprogramar" })).not.toBeInTheDocument();
  });

  it("permite reintentar una reserva fallida sin habilitar acciones", async () => {
    mocks.booking.mockReturnValue({
      data: undefined, isLoading: false, isError: true, refetch: mocks.refetchBooking,
    });
    renderPage();
    expect(await screen.findByText("No se pudo cargar la reserva vinculada")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reprogramar" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(mocks.refetchBooking).toHaveBeenCalledOnce();
  });
});
