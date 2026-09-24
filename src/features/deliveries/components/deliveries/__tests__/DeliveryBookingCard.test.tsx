import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestRouter } from "@/test/router";
import { DeliveryBookingCard } from "../DeliveryInfoCards";

const access = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/features/users", () => ({
  useHasModuleAccess: () => access.allowed,
}));
const props = {
  bookingId: "booking-3", bookingNumber: "RSV-0003", customerName: "ALCORE",
  startDate: "2026-11-09", endDate: "2026-11-13",
};

beforeEach(() => { access.allowed = true; });

describe("DeliveryBookingCard", () => {
  it("vincula el folio visible con el identificador de su reserva", async () => {
    render(<TestRouter><DeliveryBookingCard {...props} /></TestRouter>);
    expect(await screen.findByRole("link", { name: "Abrir reserva RSV-0003" }))
      .toHaveAttribute("href", "/bookings/booking-3");
  });

  it("muestra el folio como texto cuando no hay acceso a Reservas", async () => {
    access.allowed = false;
    render(<TestRouter><DeliveryBookingCard {...props} /></TestRouter>);
    expect(await screen.findByText("RSV-0003")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
