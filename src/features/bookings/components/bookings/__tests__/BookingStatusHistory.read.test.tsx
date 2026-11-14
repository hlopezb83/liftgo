import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { BookingStatusHistory } from "../BookingStatusHistory";
import type { BookingHistoryLog } from "../../../hooks/bookingDetail/useBookingStatusHistory";

const query = vi.hoisted(() => ({ data: undefined as BookingHistoryLog[] | undefined,
  isLoading: false, isError: true, isSuccess: false, isFetching: false, refetch: vi.fn() }));
vi.mock("../../../hooks/bookingDetail/useBookingStatusHistory", () => ({ useBookingStatusHistory: () => query }));

it("distinguishes initial failure from empty and keeps cached activity during retry", () => {
  const view = render(<BookingStatusHistory bookingId="booking-a" />);
  expect(screen.queryByText("Sin actividad registrada")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(query.refetch).toHaveBeenCalledOnce();
  query.data = [{ id: "log-a", action: "INSERT", created_at: "2026-11-14T12:00:00Z", changed_fields: [] } as unknown as BookingHistoryLog];
  query.isFetching = true;
  view.rerender(<BookingStatusHistory bookingId="booking-a" />);
  expect(screen.getByText("Reserva creada")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reintentar" })).toBeDisabled();
  query.data = []; query.isError = false; query.isFetching = false; query.isSuccess = true;
  view.rerender(<BookingStatusHistory bookingId="booking-a" />);
  expect(screen.getByText("Sin actividad registrada")).toBeInTheDocument();
});
