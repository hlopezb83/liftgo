import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TestRouter } from "@/test/router";
import { useLocation } from "@/lib/router-compat";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { describe, expect, it, vi, beforeEach } from "vitest";
import BookingDetail from "../BookingDetail";

/**
 * Ronda 4 (FE4-02): si la reserva falla al cargar, debe mostrarse
 * QueryErrorState y NUNCA el mensaje de "no encontrada" (que induciría al
 * usuario a pensar que el registro no existe, cuando en realidad es un
 * error de red).
 */

const useBookingMock = vi.fn();
const useBookingExtensionsMock = vi.fn();
const access = vi.hoisted(() => ({ allowed: true }));
const transportQueryFn = vi.fn();

vi.mock("../../hooks/bookings/useBookings", () => ({
  useBooking: () => useBookingMock(),
}));

vi.mock("@/features/deliveries", () => ({
  deliveryQueries: {
    list: ({ bookingId }: { bookingId: string }) => ({
      queryKey: ["deliveries", bookingId],
      queryFn: transportQueryFn,
    }),
  },
}));
vi.mock("@/features/users", () => ({ useHasModuleAccess: () => access.allowed, useHasFinancialAccess: () => true }));
vi.mock("../../components/bookings/BookingActions", () => ({ BookingActions: () => null }));
vi.mock("../../components/bookings/BookingStatusHistory", () => ({ BookingStatusHistory: () => null }));
vi.mock("../../components/booking-detail/BookingBillingCard", () => ({ BookingBillingCard: () => null }));

vi.mock("../../hooks/bookingActions/useBookingExtensions", () => ({
  useBookingExtensions: () => useBookingExtensionsMock(),
}));

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function BookingWithOrigin({ origin }: { origin?: string }) {
  const location = useLocation();
  const navigate = useNavigateTransition();
  return <>
    <output data-testid="booking-url">{location.pathname}{location.search}</output>
    {location.pathname === "/" ? <button onClick={() => navigate("/bookings/bk-1", { state: { calendarReturnTo: origin } })}>Abrir desde origen</button> : <BookingDetail />}
  </>;
}

function renderPage(origin?: string) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <TestRouter initialEntries={[origin ? "/" : "/bookings/bk-1"]} path="/bookings/$id">
        <BookingWithOrigin origin={origin} />
      </TestRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useBookingMock.mockReset();
  useBookingExtensionsMock.mockReset();
  transportQueryFn.mockReset();
  transportQueryFn.mockResolvedValue([]);
  access.allowed = true;
  useBookingExtensionsMock.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() });
});

describe("BookingDetail (FE4-02)", () => {
  it("N5: Volver returns to the exact calendar date, view and range", async () => {
    useBookingMock.mockReturnValue({
      data: { id: "bk-1", booking_number: "RSV-0001", status: "confirmed", customer_name: "Cliente", start_date: "2026-11-05", end_date: "2026-11-07" },
      isLoading: false, isError: false, refetch: vi.fn(),
    });
    renderPage("/calendar?date=2026-11-12&view=gantt&range=week");
    fireEvent.click(await screen.findByRole("button", { name: "Abrir desde origen" }));
    fireEvent.click(await screen.findByRole("button", { name: "Volver" }));
    await waitFor(() => expect(screen.getByTestId("booking-url")).toHaveTextContent("/calendar?date=2026-11-12&view=gantt&range=week"));
  });

  it.each(["https://example.com/calendar", "//example.com/calendar", "/calendar-elsewhere?date=2026-11-12"])("N5: ignores an invalid origin %s", async (origin) => {
    useBookingMock.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() });
    renderPage(origin);
    fireEvent.click(await screen.findByRole("button", { name: "Abrir desde origen" }));
    fireEvent.click(await screen.findByRole("button", { name: "Volver" }));
    await waitFor(() => expect(screen.getByTestId("booking-url")).toHaveTextContent("/bookings"));
  });

  it("muestra QueryErrorState cuando la reserva falla, no el mensaje de 'no encontrada'", async () => {
    useBookingMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });

    renderPage();

    expect(await screen.findByText("No se pudo cargar la reserva")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reintentar/i })).toBeInTheDocument();
    expect(screen.queryByText("Reserva no encontrada")).not.toBeInTheDocument();
  });

  it("no consulta transportes ni declara un falso vacío sin permiso de Entregas", async () => {
    access.allowed = false;
    useBookingMock.mockReturnValue({
      data: { id: "bk-1", booking_number: "RSV-0001", status: "confirmed", customer_name: "Cliente", start_date: "2026-10-05", end_date: "2026-10-07" },
      isLoading: false, isError: false, refetch: vi.fn(),
    });
    renderPage();
    expect(await screen.findByText(/Tu rol no tiene acceso a los transportes/)).toBeInTheDocument();
    await waitFor(() => expect(transportQueryFn).not.toHaveBeenCalled());
    expect(screen.queryByText(/aún no tiene transportes/)).not.toBeInTheDocument();
  });
});
