import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BookingWithForklift } from "@/types/rental";
import { TestRouter } from "@/test/router";
import { BookingNextStepCard } from "../BookingNextStepCard";

const state = vi.hoisted(() => ({ read: true, write: true, booking: vi.fn(), transports: vi.fn(), mutate: vi.fn(), selector: vi.fn(), fleet: vi.fn() }));
vi.mock("@/features/users", () => ({ useHasModuleAccess: (_module: string, access: string) => access === "full" ? state.write : state.read }));
vi.mock("@/features/bookings", () => ({ useConfirmedBookingsForDelivery: (enabled: boolean) => {
  state.selector(enabled);
  return { data: { pages: [[]] }, isLoading: false, isError: false, hasNextPage: false };
} }));
vi.mock("../../../hooks/bookings/useBookings", () => ({ bookingQueries: { detail: (id: string) => ({ queryKey: ["bookings", "detail", id], queryFn: state.booking }) } }));
vi.mock("@/features/fleet", () => ({
  useForkliftMap: (enabled: boolean) => { state.fleet(enabled); return { forklifts: [] }; }, useForklift: () => ({ data: null }), useActiveDrivers: () => ({ data: [] }),
}));
vi.mock("@/features/deliveries/hooks/useDeliveries", () => ({
  deliveryQueries: { list: ({ bookingId }: { bookingId: string }) => ({ queryKey: ["deliveries", "list", bookingId], queryFn: state.transports }) },
  useCreateDelivery: () => ({ mutate: state.mutate, isPending: false }),
}));

const booking = {
  id: "booking-beyond-page-100", booking_number: "RSV-0601", customer_name: "ELOGISTIX DEMO-LG01",
  forklift_id: "forklift-601", forklifts: { name: "DEMO-LG01", model: "FD50" },
  start_date: "2026-11-01", end_date: "2026-11-15", status: "confirmed", return_status: null,
} as BookingWithForklift;
const delivered = { id: "delivery-1", type: "delivery", status: "completed", completed_at: "2026-11-01T18:00:00Z" };
const props = { booking, deliveries: [], isLoading: false, isError: false };

function renderCard(overrides: Partial<Parameters<typeof BookingNextStepCard>[0]> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><TestRouter><BookingNextStepCard {...props} {...overrides} /></TestRouter></QueryClientProvider>);
  return { ...view, client };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-11T18:00:00Z"));
  state.read = true; state.write = true;
  state.booking.mockResolvedValue(booking); state.transports.mockResolvedValue([]);
});
afterEach(() => { onlineManager.setOnline(true); vi.useRealTimers(); });

describe("BookingNextStepCard", () => {
  it("does not expose cached transport context without read permission", async () => {
    state.read = false;
    renderCard({ deliveries: [{ ...delivered, status: "scheduled" }] });
    await waitFor(() => expect(screen.queryByRole("region", { name: "Siguiente paso de la renta" })).not.toBeInTheDocument());
    expect(state.booking).not.toHaveBeenCalled();
    expect(state.selector).not.toHaveBeenCalled();
  });
  it("lets a reader open the exact existing transport but never schedule or inspect", async () => {
    state.write = false;
    const view = renderCard({ deliveries: [{ ...delivered, status: "scheduled" }] });
    expect(await screen.findByRole("link", { name: "Ver entrega" })).toHaveAttribute("href", "/deliveries/delivery-1");
    view.unmount();
    renderCard();
    expect(await screen.findByText(/Despacho puede continuar/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Programar entrega" })).not.toBeInTheDocument();
  });
  it("opens a booking beyond the selector's first page with locked context, then rechecks before writing", async () => {
    const { client } = renderCard();
    client.setQueryData(["bookings", "detail", booking.id], booking);
    client.setQueryData(["deliveries", "list", booking.id], []);
    fireEvent.click(await screen.findByRole("button", { name: "Programar entrega" }));
    const dialog = await screen.findByRole("dialog", { name: "Programar transporte" });
    const reservation = within(dialog).getByRole("combobox", { name: "Reserva Vinculada" });
    expect(reservation).toHaveTextContent("RSV-0601");
    expect(reservation).toHaveTextContent("ELOGISTIX DEMO-LG01");
    expect(reservation).toBeDisabled();
    expect(within(dialog).getByRole("combobox", { name: "Montacargas" })).toHaveTextContent("DEMO-LG01");
    expect(within(dialog).getByRole("combobox", { name: "Tipo" })).toBeDisabled();
    expect(state.selector.mock.calls.every(([enabled]) => !enabled)).toBe(true);
    expect(state.fleet).toHaveBeenCalledWith(false);
    expect(state.fleet).not.toHaveBeenCalledWith(true);
    expect(state.booking).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Programar" }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledOnce());
    expect(state.booking).toHaveBeenCalledOnce();
    expect(state.transports).toHaveBeenCalledOnce();
    expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ booking_id: booking.id, forklift_id: booking.forklift_id, type: "delivery", scheduled_date: "2026-11-11" }), expect.any(Object));
  });
  it.each(["new transport", "cancelled booking", "changed unit", "failed read"])("blocks a stale scheduling form after %s", async (scenario) => {
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Programar entrega" }));
    if (scenario === "new transport") state.transports.mockResolvedValue([{ ...delivered, status: "scheduled" }]);
    if (scenario === "cancelled booking") state.booking.mockResolvedValue({ ...booking, status: "cancelled" });
    if (scenario === "changed unit") state.booking.mockResolvedValue({ ...booking, forklift_id: "other" });
    if (scenario === "failed read") state.booking.mockRejectedValue(new Error("offline"));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Programar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(scenario === "failed read" ? /No se pudo comprobar/ : /cambiaron/);
    expect(state.mutate).not.toHaveBeenCalled();
  });
  it("preselects pickup and end date, and keeps inspection as the next step only after collection", async () => {
    const view = renderCard({ deliveries: [delivered] });
    fireEvent.click(await screen.findByRole("button", { name: "Programar recolección" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("combobox", { name: "Tipo" })).toHaveTextContent("Recolección");
    expect(within(dialog).getByRole("textbox", { name: /Fecha de recolección/ })).toHaveValue("15/11/2026");
    view.unmount();
    renderCard({ deliveries: [delivered, { ...delivered, id: "pickup-1", type: "pickup" }] });
    expect(await screen.findByRole("link", { name: "Inspeccionar devolución" })).toHaveAttribute("href", `/returns?booking_id=${booking.id}&early=1`);
    expect(screen.queryByRole("button", { name: "Programar recolección" })).not.toBeInTheDocument();
  });
  it("keeps one submission in flight while current facts are being verified", async () => {
    let resolveBooking!: (value: BookingWithForklift) => void;
    state.booking.mockReturnValue(new Promise<BookingWithForklift>((resolve) => { resolveBooking = resolve; }));
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Programar entrega" }));
    const dialog = await screen.findByRole("dialog");
    const form = dialog.querySelector("form");
    if (!form) throw new Error("Expected contextual form");
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(state.booking).toHaveBeenCalledOnce());
    expect(state.mutate).not.toHaveBeenCalled();
    await act(async () => resolveBooking(booking));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledOnce());
    expect(state.transports).toHaveBeenCalledOnce();
  });
  it("validates against an updated booking period without overwriting the entered date", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Programar entrega" }));
    const dialog = await screen.findByRole("dialog");
    const date = within(dialog).getByRole("textbox", { name: /Fecha de entrega/ });
    fireEvent.change(date, { target: { value: "16112026" } });
    fireEvent.blur(date);
    state.booking.mockResolvedValue({ ...booking, end_date: "2026-11-20" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Programar" }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ scheduled_date: "2026-11-16" }), expect.any(Object)));
    expect(date).toHaveValue("16/11/2026");
  });
  it("returns focus to the current operation region when the contextual form closes", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Programar entrega" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByRole("region", { name: "Siguiente paso de la renta" })).toHaveFocus();
  });
  it("fails recoverably when connectivity is lost after opening instead of pausing the form indefinitely", async () => {
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: "Programar entrega" }));
    const dialog = await screen.findByRole("dialog");
    act(() => onlineManager.setOnline(false));
    fireEvent.click(within(dialog).getByRole("button", { name: "Programar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sin conexión");
    expect(state.booking).not.toHaveBeenCalled();
    expect(state.transports).not.toHaveBeenCalled();
    expect(state.mutate).not.toHaveBeenCalled();
    act(() => onlineManager.setOnline(true));
    const form = dialog.querySelector("form");
    if (!form) throw new Error("Expected contextual form");
    fireEvent.submit(form);
    await waitFor(() => expect(state.mutate).toHaveBeenCalledOnce());
  });
  it("does not offer writes during background refresh or after query failure", async () => {
    renderCard({ isLoading: true });
    expect(await screen.findByText(/Comprobando los transportes/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Programar entrega" })).not.toBeInTheDocument();
  });
});
