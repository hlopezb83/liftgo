import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TestRouter } from "@/test/router";
import BookingForm from "../BookingForm";

const submit = vi.hoisted(() => vi.fn());
vi.mock("@/features/customers", () => ({ CustomerSelector: () => null }));
vi.mock("@/features/fleet", async () => ({
  ...await import("@/features/fleet/components/fleet/ForkliftSelector"),
  ForkliftAvailabilityHelp: () => null,
  useAvailableForklifts: (range?: { from?: Date; to?: Date }) => {
    const inverted = !!range?.from && !!range?.to && range.from > range.to;
    const datesSelected = !!range?.from && !!range?.to && !inverted;
    const units = [{ id: "fork-1", name: "Equipo demo", manufacturer: "Demo", model: "A" }];
    return { datesSelected, availableForklifts: units, forklifts: units, isSuccess: datesSelected,
      dateRangeError: inverted ? "La fecha de fin debe ser igual o posterior a la de inicio" : undefined,
      isLoading: false, isError: false, isFetching: false, refetch: vi.fn() };
  },
}));
vi.mock("../../components/bookings/BookingDraftNotice", () => ({ BookingDraftNotice: () => null }));
vi.mock("../../components/bookings/BookingPostDialogs", () => ({ BookingPostDialogs: () => null }));
vi.mock("../../hooks/bookingForm/useBookingFormLogic", async () => {
  const { useBookingFormState } = await import("../../hooks/bookingForm/useBookingFormState");
  return { useBookingFormLogic: () => {
    const state = useBookingFormState();
    return { ...state,
    draft: { submitBlocked: false }, customers: [], createBooking: { isPending: false }, isSubmitting: false,
    submitError: null, onSubmit: submit, selectedForklift: { name: "Equipo demo" }, navigate: vi.fn(),
  }; } };
});

beforeEach(() => submit.mockClear());

describe("BookingForm date errors and focus", () => {
  it("separa captura inválida y campos vacíos, enfoca el primer error y conserva la renta de un día", async () => {
    render(<TestRouter initialEntries={["/bookings/new"]} path="/bookings/new"><BookingForm /></TestRouter>);
    const start = await screen.findByRole("textbox", { name: "Fechas de reserva — inicio" });
    const end = screen.getByRole("textbox", { name: "Fechas de reserva — fin" });
    fireEvent.change(start, { target: { value: "31/02/2027" } });
    fireEvent.blur(start);
    expect(start).toHaveAccessibleDescription(/31\/02\/2027 no existe/);
    expect(screen.queryByText("Fecha de inicio es requerida")).not.toBeInTheDocument();
    fireEvent.submit(start.closest("form")!);
    await waitFor(() => expect(end).toHaveAccessibleDescription(/Fecha de fin es requerida/));
    await waitFor(() => expect(start).toHaveFocus());
    expect(submit).not.toHaveBeenCalled();

    fireEvent.change(start, { target: { value: "28/02/2027" } });
    fireEvent.change(end, { target: { value: "27/02/2027" } });
    await waitFor(() => expect(end).toHaveAccessibleDescription(/igual o posterior/));
    expect(start).not.toHaveAttribute("aria-invalid", "true");
    fireEvent.submit(start.closest("form")!);
    await waitFor(() => expect(end).toHaveFocus());

    fireEvent.change(end, { target: { value: "28/02/2027" } });
    await waitFor(() => expect(end).not.toHaveAttribute("aria-invalid", "true"));
    fireEvent.submit(start.closest("form")!);
    const forklift = screen.getByRole("combobox", { name: "Montacargas" });
    await waitFor(() => expect(forklift).toHaveFocus());
    expect(forklift).toHaveAccessibleDescription("Montacargas es requerido");
    fireEvent.click(forklift);
    fireEvent.click(await screen.findByRole("option", { name: /Equipo demo/ }));
    fireEvent.submit(start.closest("form")!);
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0][0].date_range).toEqual({ from: new Date(2027, 1, 28), to: new Date(2027, 1, 28) });
  });
});
