import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it, vi, beforeEach } from "vitest";
import BookingDetail from "../BookingDetail";

/**
 * Ronda 4 (FE4-02): si la reserva falla al cargar, debe mostrarse
 * QueryErrorState y NUNCA el mensaje de "no encontrada" (que induciría al
 * usuario a pensar que el registro no existe, cuando en realidad es un
 * error de red).
 */

const useBookingMock = vi.fn();
const useDeliveriesMock = vi.fn();
const useBookingExtensionsMock = vi.fn();

vi.mock("../../hooks/bookings/useBookings", () => ({
  useBooking: () => useBookingMock(),
}));

vi.mock("@/features/deliveries", () => ({
  useDeliveries: () => useDeliveriesMock(),
}));

vi.mock("../../hooks/bookingActions/useBookingExtensions", () => ({
  useBookingExtensions: () => useBookingExtensionsMock(),
}));

function createTestQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPage() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={["/bookings/bk-1"]}>
        <Routes>
          <Route path="/bookings/:id" element={<BookingDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useBookingMock.mockReset();
  useDeliveriesMock.mockReset();
  useBookingExtensionsMock.mockReset();
  useDeliveriesMock.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() });
  useBookingExtensionsMock.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() });
});

describe("BookingDetail (FE4-02)", () => {
  it("muestra QueryErrorState cuando la reserva falla, no el mensaje de 'no encontrada'", () => {
    useBookingMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });

    renderPage();

    expect(screen.getByText("No se pudo cargar la reserva")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reintentar/i })).toBeInTheDocument();
    expect(screen.queryByText("Reserva no encontrada")).not.toBeInTheDocument();
  });
});
